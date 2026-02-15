import axios from 'axios';
import fs from 'fs';

async function finalVipTest() {
    console.log("🔍 Final VIP tests...");
    const urls = [
        'https://www.vipleiloes.com.br/Home/Resultados',
        'https://www.vipleiloes.com.br/Veiculos',
        'https://www.vipleiloes.com.br/Resultados'
    ];
    for (const url of urls) {
        console.log(`Testing ${url}...`);
        try {
            const res = await axios.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
            console.log(`✅ ${url} - Status: ${res.status} - Length: ${res.data.length}`);
            if (res.data.includes('itm-card')) console.log(`🎯 FOUND itm-card at ${url}`);
        } catch (e) {
            console.log(`❌ ${url} - Error: ${e.message}`);
        }
    }
}
finalVipTest();
