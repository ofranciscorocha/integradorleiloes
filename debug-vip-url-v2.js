import axios from 'axios';

async function debugVip() {
    // VIP often lists items in categories
    const base = 'https://www.vipleiloes.com.br';
    const paths = [
        '/Veiculos/ListarVeiculos?Pagina=1',
        '/Pesquisa',
        '/Pesquisa?classificacao=Usados',
        '/Comprar/Veiculos'
    ];

    for (const p of paths) {
        console.log(`🔍 Testing ${p}...`);
        try {
            const { data } = await axios.get(base + p, {
                headers: { 'User-Agent': 'Mozilla/5.0' },
                timeout: 5000
            });
            console.log(`✅ ${p} - Length: ${data.length}`);
            if (data.includes('itm-card')) {
                console.log(`🎯 FOUND itm-card at ${p}!`);
            }
        } catch (e) {
            console.log(`❌ ${p} - Error: ${e.message}`);
        }
    }
}

debugVip();
