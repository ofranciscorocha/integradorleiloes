import axios from 'axios';

const BASE_URL = 'https://www.vipleiloes.com.br';

const testAxios = async () => {
    try {
        console.log(`Testing URL: ${BASE_URL}/pesquisa?handler=pesquisar`);
        const response = await axios.get(`${BASE_URL}/pesquisa`, {
            params: {
                SortOrder: 'DataInicio',
                pageNumber: 1,
                handler: 'pesquisar'
            },
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
                'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7',
                'Cache-Control': 'no-cache',
                'Pragma': 'no-cache',
                // 'X-Requested-With': 'XMLHttpRequest' // Try without this distinct header first or with it
            },
            maxRedirects: 0,
            validateStatus: status => status >= 200 && status < 400 // Accept 3xx to see them
        });

        console.log('Status:', response.status);
        console.log('Headers:', response.headers);
        console.log('Final URL:', response.request.res.responseUrl);
        // console.log('Data preview:', response.data.substring(0, 500));
    } catch (error) {
        console.error('Error:', error.message);
        if (error.response) {
            console.log('Error Status:', error.response.status);
            console.log('Error Headers:', error.response.headers);
        }
    }
};

testAxios();
