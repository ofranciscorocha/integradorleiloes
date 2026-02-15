import axios from 'axios';

async function findVipSitemap() {
    console.log("🔍 Fetching VIP sitemap...");
    try {
        const { data } = await axios.get('https://www.vipleiloes.com.br/sitemap.xml', {
            headers: { 'User-Agent': 'Mozilla/5.0' }
        });
        console.log("📄 Sitemap Content (first 500 chars):", data.substring(0, 500));
        if (data.includes('ListarVeiculos')) {
            console.log("✅ Found ListarVeiculos in sitemap!");
        }
    } catch (e) {
        console.error("❌ Sitemap Error:", e.message);
    }
}

findVipSitemap();
