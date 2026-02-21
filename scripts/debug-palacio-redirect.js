import axios from 'axios';

const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

async function checkRedirect() {
    const url = 'https://www.palaciodosleiloes.com.br/site/?opcao=exibir_lote&id_lote=1496180&id_leilao=8254';
    try {
        console.log(`Checking ${url}...`);
        const response = await axios.get(url, {
            headers: { 'User-Agent': USER_AGENT },
            maxRedirects: 0,
            validateStatus: (status) => status >= 200 && status < 400
        });
        console.log(`Status: ${response.status}`);
        console.log(`Headers:`, response.headers);
    } catch (error) {
        console.log(`Error: ${error.message}`);
        if (error.response) {
            console.log(`Status: ${error.response.status}`);
            console.log(`Headers:`, error.response.headers);
        }
    }
}

checkRedirect();
