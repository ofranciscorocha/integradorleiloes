import axios from 'axios';
import fs from 'fs';

async function debugVip() {
    const url = 'https://www.vipleiloes.com.br/Veiculos/ListarVeiculos?Pagina=1&OrdenacaoVeiculo=InicioLeilao';

    console.log("📨 Fetching VIP page...");
    try {
        const { data } = await axios.get(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36'
            }
        });

        fs.writeFileSync('debug-vip.html', data);
        console.log("📄 HTML saved to debug-vip.html. Length:", data.length);
    } catch (e) {
        console.error("❌ Error:", e.message);
    }
}

debugVip();
