import axios from 'axios';
import fs from 'fs';

const testSearch = async () => {
    try {
        const url = 'https://www.vipleiloes.com.br/pesquisa/index?q=gol';
        console.log(`Fetching: ${url}`);

        const { data, status } = await axios.get(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
            }
        });

        console.log(`Status: ${status}`);
        console.log(`Size: ${data.length}`);

        fs.writeFileSync('dump-search.html', data);
        console.log('Salvo em dump-search.html');

    } catch (e) {
        console.error(e.message);
        if (e.response) {
            console.log('Response status:', e.response.status);
            console.log('Response headers:', e.response.headers);
        }
    }
};

testSearch();
