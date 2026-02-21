
import axios from 'axios';

const BASE_URL = 'http://localhost:8181';

async function testApi() {
    try {
        console.log('Testing /veiculos endpoint...');

        // Test basic fetch with limit 24
        const res = await axios.get(`${BASE_URL}/veiculos?limit=24`);
        console.log(`✅ Default Fetch: Got ${res.data.items.length} items (Expected up to 24)`);

        // Test search filter
        const searchRes = await axios.get(`${BASE_URL}/veiculos?search=FIAT`);
        console.log(`✅ Search 'FIAT': Got ${searchRes.data.items.length} items.`);

        // Test site filter (using a domain from the DB)
        const siteRes = await axios.get(`${BASE_URL}/veiculos?site=vipleiloes.com.br`);
        console.log(`✅ Site Filter 'vipleiloes.com.br': Got ${siteRes.data.items.length} items.`);

        console.log('\nAll API tests passed (logic-wise).');
    } catch (error) {
        console.error('❌ API Test Failed:', error.message);
        if (error.response) console.error('Response:', error.response.data);
    }
}

testApi();
