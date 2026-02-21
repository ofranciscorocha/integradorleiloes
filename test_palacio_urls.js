
import axios from 'axios';

const variations = [
    'https://www.palaciodosleiloes.com.br/site/?opcao=exibir_lote&id_lote=1495761&id_leilao=8257',
    'https://www.palaciodosleiloes.com.br/site/index.php?opcao=exibir_lote&id_lote=1495761&id_leilao=8257',
    'https://www.palaciodosleiloes.com.br/site/?opcao=exibir_lote&lote=1495761&leilao=8257',
    'https://www.palaciodosleiloes.com.br/site/?opcao=exibir_lote&id=1495761',
    'https://www.palaciodosleiloes.com.br/lote/1495761',
    'https://www.palaciodosleiloes.com.br/leilao/8257/lote/1495761'
];

(async () => {
    for (const url of variations) {
        try {
            console.log(`Testing ${url}...`);
            const { data, status, request } = await axios.get(url, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
                    'Referer': 'https://www.palaciodosleiloes.com.br/site/'
                },
                validateStatus: () => true,
                maxRedirects: 0 // We want to see if it redirects
            });

            console.log(`Status: ${status}`);
            if (status >= 300 && status < 400) {
                console.log(`REDIRECTS TO: ${request.res.responseUrl || data.headers?.location}`);
            } else if (data.includes('lote não encontrado') || data.includes('Nenhum dado')) {
                console.log('Result: NOT FOUND content');
            } else if (data.length < 1000) {
                console.log('Result: Suspiciously short content');
            } else {
                console.log('Result: LOOKS GOOD (Content length: ' + data.length + ')');
                // Check if it confirms the lot title "FORD/ECOSPORT"
                if (data.includes('FORD/ECOSPORT')) console.log('   ✅ VERIFIED: Contains vehicle name');
            }

        } catch (e) {
            console.log(`Error: ${e.message}`);
        }
        console.log('---');
    }
})();
