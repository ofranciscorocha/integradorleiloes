
import axios from 'axios';

const testCopartApi = async () => {
    const pageNum = 1;
    const url = `https://www.copart.com.br/lotSearchResults?free=true&query=&page=${pageNum}`;
    console.log('Testing Copart API:', url);

    try {
        const response = await axios.get(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
                'Accept': 'application/json, text/plain, */*',
                'X-Requested-With': 'XMLHttpRequest'
            },
            timeout: 30000
        });

        console.log('Status:', response.status);
        const data = response.data;

        if (data.data && data.data.results) {
            const results = data.data.results.content;
            console.log('Items found:', results.length);
            if (results.length > 0) {
                console.log('First Title:', results[0].mkn + ' ' + results[0].mdl);
            }
        } else {
            console.log('Response structure unexpected:', Object.keys(data));
            console.log('Sample data:', JSON.stringify(data).substring(0, 500));
        }

    } catch (error) {
        console.error('Error:', error.message);
        if (error.response) {
            console.error('Response Status:', error.response.status);
        }
    }
};

testCopartApi();
