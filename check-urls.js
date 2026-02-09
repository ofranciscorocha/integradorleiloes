import axios from 'axios';

const urls = [
    'https://www.vipleiloes.com.br/veiculos',
    'https://www.vipleiloes.com.br/leiloes',
    'https://www.vipleiloes.com.br/lotes',
    'https://www.vipleiloes.com.br/pesquisa',
    'https://www.vipleiloes.com.br/busca',
    'https://www.vipleiloes.com.br/robots.txt'
];

const check = async () => {
    console.log('Testando URLs...');
    for (const url of urls) {
        try {
            const res = await axios.get(url, {
                validateStatus: () => true, // Não lança erro em 404
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
                }
            });
            console.log(`[${res.status}] ${url} - Size: ${res.data.length}`);
            if (url.endsWith('robots.txt')) {
                console.log('--- robots.txt content ---');
                console.log(res.data);
            }
        } catch (e) {
            console.log(`[ERROR] ${url} - ${e.message}`);
        }
    }
};

check();
