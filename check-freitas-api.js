import axios from 'axios';
import https from 'https';
import fs from 'fs';

const testFreitasApi = async () => {
    try {
        const url = 'https://www.freitasleiloeiro.com.br/Leiloes/PesquisarLotes';
        const params = {
            Categoria: 1, // Veículos
            PageNumber: 1,
            TopRows: 10
        };

        console.log(`Fetching API: ${url}`);

        const agent = new https.Agent({
            rejectUnauthorized: false
        });

        const { data } = await axios.get(url, {
            params,
            httpsAgent: agent,
            headers: {
                'X-Requested-With': 'XMLHttpRequest', // Importante para ASP.NET MVC identificar AJAX
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
            }
        });

        console.log(`Size: ${data.length}`);
        fs.writeFileSync('dump-freitas-api.html', data);
        console.log('Salvo em dump-freitas-api.html');

    } catch (e) {
        console.error(e.message);
    }
};

testFreitasApi();
