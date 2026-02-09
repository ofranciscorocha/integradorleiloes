import axios from 'axios';
import fs from 'fs';

const dumpCanalNoRedirect = async () => {
    try {
        const url = 'https://www.vipleiloes.com.br/canal';
        console.log(`Fetching: ${url}`);
        const response = await axios.get(url, {
            maxRedirects: 0,
            validateStatus: status => status >= 200 && status < 400
        });

        console.log(`Status: ${response.status}`);
        if (response.headers.location) console.log(`Location: ${response.headers.location}`);

        fs.writeFileSync('dump-canal.html', response.data);
        console.log('Salvo em dump-canal.html');

    } catch (e) {
        console.error(e);
    }
};
dumpCanalNoRedirect();
