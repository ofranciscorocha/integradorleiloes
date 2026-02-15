import axios from 'axios';
import fs from 'fs';

async function debugVipCanal() {
    try {
        const res = await axios.get('https://www.vipleiloes.com.br/canal', {
            headers: { 'User-Agent': 'Mozilla/5.0' },
            maxRedirects: 5
        });
        console.log("Final URL:", res.request.res.responseUrl);
        console.log("Length:", res.data.length);
        fs.writeFileSync('debug-vip-canal.html', res.data);
        if (res.data.includes('itm-card')) {
            console.log("🎯 FOUND itm-card in /canal!");
        }
    } catch (e) {
        console.error("Error:", e.message);
    }
}

debugVipCanal();
