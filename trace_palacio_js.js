
import axios from 'axios';
import * as cheerio from 'cheerio';

const searchScript = async () => {
    const urls = [
        'https://www.palaciodosleiloes.com.br/site/',
        'https://www.palaciodosleiloes.com.br/site/js/geral.js',
        'https://www.palaciodosleiloes.com.br/site/js/funcoes.js',
        'https://www.palaciodosleiloes.com.br/site/js/scripts.js'
    ];

    for (const url of urls) {
        try {
            console.log(`Searching in ${url}...`);
            const { data } = await axios.get(url, {
                headers: { 'User-Agent': 'Mozilla/5.0' },
                validateStatus: () => true
            });

            if (typeof data === 'string' && data.includes('exibir_lote')) {
                console.log(`   ✅ Found 'exibir_lote' in ${url}`);
                const idx = data.indexOf('function exibir_lote');
                if (idx !== -1) {
                    console.log('--- DEFINITION ---');
                    console.log(data.substring(idx, idx + 300));
                } else {
                    // Try to find where it's called or defined via regex
                    const match = data.match(/exibir_lote\s*=\s*function|function\s+exibir_lote/);
                    if (match) {
                        console.log('   (Regex found definition)');
                        const start = data.indexOf(match[0]);
                        console.log(data.substring(start, start + 300));
                    }
                }
            }
        } catch (e) { }
    }
};

searchScript();
