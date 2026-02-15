import axios from 'axios';
import fs from 'fs';

async function findVipUrl() {
    console.log("🔍 Fetching VIP homepage...");
    try {
        const { data } = await axios.get('https://www.vipleiloes.com.br/', {
            headers: { 'User-Agent': 'Mozilla/5.0' }
        });

        fs.writeFileSync('debug-vip-home.html', data);
        console.log("📄 Saved VIP home to debug-vip-home.html");

        // Look for links that might lead to vehicle listing
        const links = data.match(/href="([^"]+)"/g) || [];
        const interesting = links.filter(l => l.toLowerCase().includes('veiculo') || l.toLowerCase().includes('pesquisa'));
        console.log("🔗 Interesting links found:", interesting.slice(0, 10));
    } catch (e) {
        console.error("❌ Error:", e.message);
    }
}

findVipUrl();
