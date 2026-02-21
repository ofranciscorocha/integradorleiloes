import axios from 'axios';
import * as cheerio from 'cheerio';

const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

async function findExibirLote() {
    try {
        console.log('Fetching Palácio homepage to search for exibir_lote...');
        const { data } = await axios.get('https://www.palaciodosleiloes.com.br/', {
            headers: { 'User-Agent': USER_AGENT }
        });

        const $ = cheerio.load(data);

        // Check inline scripts
        let found = false;
        $('script').each((i, el) => {
            const content = $(el).html();
            if (content && content.includes('function exibir_lote')) {
                console.log('FOUND EXHIBIT_LOTE INLINE:');
                console.log(content.substring(content.indexOf('function exibir_lote'), content.indexOf('}', content.indexOf('function exibir_lote')) + 1));
                found = true;
            }
        });

        if (!found) {
            console.log('Not found in inline scripts. Checking external script URLs...');
            $('script[src]').each((i, el) => {
                const src = $(el).attr('src');
                console.log(`Script src: ${src}`);
            });
        }
    } catch (e) {
        console.error(e.message);
    }
}

findExibirLote();
