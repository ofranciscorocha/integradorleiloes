import axios from 'axios';
import fs from 'fs';

async function testVipHeaders() {
    console.log("🔍 Fetching VIP with full browser headers...");
    try {
        const res = await axios.get('https://www.vipleiloes.com.br/', {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
                'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7',
                'Accept-Encoding': 'gzip, deflate, br',
                'Connection': 'keep-alive',
                'Upgrade-Insecure-Requests': '1',
                'Sec-Fetch-Dest': 'document',
                'Sec-Fetch-Mode': 'navigate',
                'Sec-Fetch-Site': 'none',
                'Sec-Fetch-User': '?1'
            },
            maxRedirects: 5
        });
        console.log("Final URL:", res.request.res.responseUrl);
        console.log("Length:", res.data.length);
        fs.writeFileSync('debug-vip-full.html', res.data);
    } catch (e) {
        console.error("Error:", e.message);
        if (e.response) {
            console.log("Status:", e.response.status);
            console.log("Headers:", e.response.headers);
        }
    }
}

testVipHeaders();
