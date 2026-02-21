import axios from 'axios';
import * as cheerio from 'cheerio';

const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

async function findScripts() {
    try {
        console.log('Fetching Palácio homepage...');
        const { data } = await axios.get('https://www.palaciodosleiloes.com.br/', {
            headers: { 'User-Agent': USER_AGENT }
        });
        const $ = cheerio.load(data);
        const scripts = [];
        $('script[src]').each((i, el) => {
            scripts.push($(el).attr('src'));
        });
        console.log('Scripts found:', scripts);
    } catch (e) {
        console.error(e.message);
    }
}

findScripts();
