
import axios from 'axios';
import UserAgent from 'user-agents';

const BASE_URL = 'https://www.vipleiloes.com.br';
const API_URL = `${BASE_URL}/Pesquisa/GetLotes`;

const debugVipApi = async () => {
    console.log('🚀 Testing VIP Leilões API...');

    const userAgent = new UserAgent().toString();
    console.log(`User-Agent: ${userAgent}`);

    const payload = {
        "categoria": "veiculos",
        "pagination": {
            "page": 1,
            "limit": 24
        }
    };
    // Note: The actual payload might be different. I need to check what the crawler uses.

    // Let's try to mimic the crawler's request from logs or code.
    // The log said: "API Error (Veículos (tp=1), sk=0)"

    try {
        const response = await axios.post(API_URL, {
            "tipo": 1, // Veiculos
            "skip": 0,
            "take": 20
        }, {
            headers: {
                'User-Agent': userAgent,
                'Content-Type': 'application/json',
                'X-Requested-With': 'XMLHttpRequest',
                'Referer': BASE_URL
            },
            validateStatus: () => true
        });

        console.log(`Status: ${response.status}`);
        console.log('Headers:', response.headers);
        console.log('Data Type:', typeof response.data);

        if (typeof response.data === 'string') {
            console.log('Response (First 500 chars):');
            console.log(response.data.substring(0, 500));
        } else {
            console.log('Response JSON keys:', Object.keys(response.data));
        }

    } catch (error) {
        console.error('Error:', error.message);
        if (error.response) {
            console.log('Response data:', error.response.data);
        }
    }
};

debugVipApi();
