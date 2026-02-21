import axios from 'axios';

const url = 'https://venda-imoveis.caixa.gov.br/sistema/busca-imovel.asp';

(async () => {
    try {
        console.log(`Checking ${url}...`);
        const response = await axios.get(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36'
            },
            timeout: 10000,
            validateStatus: () => true
        });
        console.log(`Status: ${response.status}`);
        console.log('Headers:', response.headers);
    } catch (e) {
        console.error('Error:', e.message);
        if (e.response) console.log('Status:', e.response.status);
    }
})();
