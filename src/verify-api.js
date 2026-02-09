import axios from 'axios';

const verify = async () => {
    try {
        console.log('Testing connectivty to API...');
        const stats = await axios.get('http://localhost:8181/stats');
        console.log('GET /stats result:', JSON.stringify(stats.data, null, 2));

        const list = await axios.get('http://localhost:8181/veiculos?limit=5');
        console.log('GET /veiculos result (first 5):', list.data.items.length, 'items');

    } catch (error) {
        console.error('API Verification failed:', error.message);
    }
};

verify();
