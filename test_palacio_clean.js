
import axios from 'axios';

const testCleanUrls = async () => {
    const lotId = '1495761';
    const base = 'https://www.palaciodosleiloes.com.br/site';
    const paths = [
        `${base}/lote/exibir/${lotId}`,
        `${base}/item/exibir/${lotId}`,
        `${base}/lote/${lotId}`,
        `${base}/item/${lotId}`,
        `${base}/lote/detalhes/${lotId}`
    ];

    for (const url of paths) {
        try {
            console.log(`Testing: ${url}`);
            const { status, request } = await axios.get(url, {
                headers: { 'User-Agent': 'Mozilla/5.0' },
                maxRedirects: 0,
                validateStatus: () => true
            });
            console.log(`   Status: ${status}`);
            if (status >= 300 && status < 400) {
                console.log(`   Redirects to: ${request.res.responseUrl || '?'}`);
            }
        } catch (e) {
            console.log(`   Error: ${e.message}`);
        }
    }
};

testCleanUrls();
