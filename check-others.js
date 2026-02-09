import axios from 'axios';

const others = [
    'https://www.sodresantoro.com.br/veiculos/lotes?sort=auction_date_init_asc',
    'https://www.freitasleiloeiro.com.br/Leiloes/Pesquisar?query=&categoria=1'
];

const checkRequest = async () => {
    for (const url of others) {
        try {
            console.log(`Checking: ${url}`);
            const { data, status } = await axios.get(url, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
                }
            });
            console.log(`[${status}] Size: ${data.length}`);
            if (data.includes('Incapsula') || data.includes('Cloudflare')) {
                console.log('--- BLOCKED ---');
            } else {
                console.log('--- OK ---');
            }
        } catch (e) {
            console.log(`[ERROR] ${e.message}`);
        }
        console.log('-------------------');
    }
};

checkRequest();
