
import axios from 'axios';
import * as cheerio from 'cheerio';

const urls = [
    'https://www.palaciodosleiloes.com.br/',
    'https://www.palaciodosleiloes.com.br/site/',
    'https://www.palaciodosleiloes.com.br/site/scripts/geral.js', // Guessing common names
    'https://www.palaciodosleiloes.com.br/site/js/scripts.js'
];

(async () => {
    for (const url of urls) {
        try {
            console.log(`\nFetching ${url}...`);
            const { data } = await axios.get(url, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36'
                },
                validateStatus: status => true
            });

            console.log(`Status: ${data.length > 500 ? 'OK' : 'Short/Error'}`);

            if (typeof data === 'string' && data.includes('exibir_lote')) {
                console.log('--- FOUND "exibir_lote" ---');

                // Extract function definition using regex
                // function exibir_lote(id_lote, id_leilao) { ... }
                const fnRegex = /function\s+exibir_lote\s*\(([^)]*)\)\s*\{([\s\S]*?)\}/;
                const match = data.match(fnRegex);

                if (match) {
                    console.log('DEFINITION FOUND:');
                    console.log(match[0].substring(0, 500)); // Print first 500 chars of function
                } else {
                    console.log('(Function definition regex failed, but string exists in content)');
                    // Print context
                    const idx = data.indexOf('exibir_lote');
                    console.log(data.substring(idx - 50, idx + 150));
                }
                return; // Found it, stop
            }
        } catch (e) {
            console.error(`Error: ${e.message}`);
        }
    }
    console.log('Done searching.');
})();
