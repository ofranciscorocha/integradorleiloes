import axios from 'axios';

const checkRedirect = async () => {
    try {
        const url = 'https://www.vipleiloes.com.br/pesquisa?q=gol';
        console.log(`Checking redirects for: ${url}`);

        const response = await axios.get(url, {
            maxRedirects: 0,
            validateStatus: status => status >= 200 && status < 400,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
            }
        });

        console.log(`Status: ${response.status}`);
        if (response.headers.location) {
            console.log(`Redirects to: ${response.headers.location}`);
        } else {
            console.log('No redirect. Content length:', response.data.length);
        }

    } catch (error) {
        console.error('Error:', error.message);
        if (error.response) {
            console.log('Status:', error.response.status);
            console.log('Location:', error.response.headers.location);
        }
    }
};

checkRedirect();
