import axios from 'axios';
import https from 'https';
import fs from 'fs';

const debugFreitas = async () => {
    try {
        const url = 'https://www.freitasleiloeiro.com.br/Leiloes/Pesquisar?query=&categoria=1';
        console.log(`Fetching: ${url}`);

        const agent = new https.Agent({
            rejectUnauthorized: false
        });

        const { data } = await axios.get(url, {
            httpsAgent: agent,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
            }
        });

        console.log(`Size: ${data.length}`);
        fs.writeFileSync('dump-freitas.html', data);
        console.log('Salvo em dump-freitas.html');

    } catch (e) {
        console.error(e.message);
    }
};

debugFreitas();
