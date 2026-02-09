import axios from 'axios';

const debugCopartContent = async () => {
    try {
        const url = 'https://www.copart.com.br/lotSearchResults/?free=true&query=';
        const { data } = await axios.get(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
            }
        });
        console.log('--- Content ---');
        console.log(data);
    } catch (e) {
        console.log(e.message);
    }
};

debugCopartContent();
