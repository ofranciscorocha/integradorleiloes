import axios from 'axios';

const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

async function getFuncoes() {
    const url = 'https://www.palaciodosleiloes.com.br/site/js/funcoes_v118.js';
    try {
        console.log(`Fetching ${url}...`);
        const { data } = await axios.get(url, {
            headers: { 'User-Agent': USER_AGENT },
            timeout: 10000
        });

        const search = 'function exibir_lote';
        const index = data.indexOf(search);
        if (index !== -1) {
            console.log('FOUND EXHIBIR_LOTE:');
            // Print a large chunk to see the navigation logic
            console.log(data.substring(index, data.indexOf('}', data.indexOf('window.open', index)) + 50));
        } else {
            console.log('Function not found in this script.');
        }
    } catch (error) {
        console.error('Error fetching JS:', error.message);
    }
}

getFuncoes();
