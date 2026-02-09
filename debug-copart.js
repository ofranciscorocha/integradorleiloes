import axios from 'axios';

const debugCopart = async () => {
    console.log('🔍 Debug Copart API\n');

    const urls = [
        'https://www.copart.com.br/public/v1/products/list',
        'https://www.copart.com.br/api/v1/products/list',
        'https://www.copart.com.br/lotSearchResults/?free=true&query=',
        'https://www.copart.com.br/public/lots/search'
    ];

    for (const url of urls) {
        try {
            console.log(`Testing: ${url}`);
            const { data, status, headers } = await axios.get(url, {
                validateStatus: () => true,
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
                    'Accept': 'application/json, text/plain, */*'
                }
            });

            console.log(`[${status}] Type: ${headers['content-type']} - Size: ${JSON.stringify(data).length}`);

            if (headers['content-type'].includes('json') && status === 200) {
                console.log('--- JSON FOUND! ---');
                console.log(JSON.stringify(data).substring(0, 500));
            }
        } catch (e) {
            console.log(`[ERROR] ${url}: ${e.message}`);
        }
        console.log('--------------------------------------------------');
    }
};

debugCopart();
