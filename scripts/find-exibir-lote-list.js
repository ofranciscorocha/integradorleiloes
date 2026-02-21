import axios from 'axios';
import * as cheerio from 'cheerio';

const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

async function findInList() {
    try {
        console.log('Fetching Palácio category list page...');
        const { data } = await axios.get('https://www.palaciodosleiloes.com.br/lotes/lista/categoria/1/?quebra=true', {
            headers: { 'User-Agent': USER_AGENT }
        });

        const $ = cheerio.load(data);
        const scriptUrls = [];
        $('script[src]').each((i, el) => {
            scriptUrls.push($(el).attr('src'));
        });

        console.log('Script URLs found on list page:');
        scriptUrls.forEach(url => console.log(url));

        // Search in all scripts found
        for (const url of scriptUrls) {
            const absoluteUrl = url.startsWith('http') ? url : `https://www.palaciodosleiloes.com.br/${url}`;
            try {
                const { data: jsContent } = await axios.get(absoluteUrl, { headers: { 'User-Agent': USER_AGENT }, timeout: 5000 });
                if (jsContent.includes('function exibir_lote')) {
                    console.log(`FOUND! In script: ${url}`);
                    const start = jsContent.indexOf('function exibir_lote');
                    console.log(jsContent.substring(start, jsContent.indexOf('}', start + 100) + 1));
                    break;
                }
            } catch (err) {
                // Ignore errors (external libs)
            }
        }

    } catch (e) {
        console.error(e.message);
    }
}

findInList();
