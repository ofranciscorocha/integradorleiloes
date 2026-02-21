
import axios from 'axios';
import * as cheerio from 'cheerio';

const checkCanonical = async () => {
    const url = 'https://www.palaciodosleiloes.com.br/site/?opcao=exibir_lote&id_lote=1495761&id_leilao=8257';
    try {
        console.log(`Fetching ${url}...`);
        const { data } = await axios.get(url, {
            headers: { 'User-Agent': 'Mozilla/5.0' }
        });
        const $ = cheerio.load(data);
        const canonical = $('link[rel="canonical"]').attr('href');
        console.log(`Canonical Link: ${canonical || 'None'}`);

        // Check for other links
        console.log('Other interesting links:');
        $('a').each((i, el) => {
            const href = $(el).attr('href');
            if (href && (href.includes('/lote/') || href.includes('/item/'))) {
                console.log(`Found: ${href}`);
            }
        });

    } catch (e) {
        console.log(`Error: ${e.message}`);
    }
};

checkCanonical();
