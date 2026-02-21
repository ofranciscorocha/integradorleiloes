
import axios from 'axios';

(async () => {
    // This is the link format being used by the crawler
    const lotId = '1495761';
    const auctionId = '8257';
    const url = `https://www.palaciodosleiloes.com.br/site/?opcao=exibir_lote&id_lote=${lotId}&id_leilao=${auctionId}`;

    console.log(`Checking URL: ${url}`);

    try {
        const response = await axios.get(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36'
            },
            maxRedirects: 5,
            validateStatus: status => true // Allow all status codes
        });

        console.log(`Status: ${response.status}`);
        console.log(`Final URL: ${response.request.res.responseUrl}`); // Detect redirection if any

        // Check content for error indicators
        if (response.data.includes('lote não encontrado') || response.data.includes('Nenhum dado encontrado')) {
            console.log('Main Content indicates lot NOT FOUND.');
        } else {
            console.log('Main Content looks OK.');
        }

    } catch (error) {
        console.error(`Error: ${error.message}`);
    }
})();
