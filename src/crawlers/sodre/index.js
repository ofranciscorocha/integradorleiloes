import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import dotenv from 'dotenv';
import connectDatabase from '../../database/db.js';

dotenv.config();
puppeteer.use(StealthPlugin());

let db;

export const execute = async (database) => {
    db = database;
    const SITE = 'sodresantoro.com.br';
    console.log(`🚀 [${SITE}] HIGH-YIELD: Iniciando captura via API Intercept...`);

    const browser = await puppeteer.launch({
        headless: "new",
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--window-size=1920,1080']
    });

    let capturados = 0;
    try {
        const page = await browser.newPage();
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36');

        // Capture API responses
        page.on('response', async response => {
            const url = response.url();
            if (url.includes('api/search-lots')) {
                try {
                    const data = await response.json();
                    if (data && data.results && Array.isArray(data.results)) {
                        const veiculos = data.results.map(item => {
                            const link = `https://www.sodresantoro.com.br/leilao/${item.auction_id}/lote/${item.lot_id}`;
                            return {
                                registro: String(item.lot_id || item.id),
                                site: SITE,
                                link: link,
                                veiculo: item.lot_title || item.lot_description || 'Veículo Sodré',
                                fotos: item.lot_pictures || [],
                                valor: parseFloat(item.bid_actual || item.bid_initial || 0),
                                modalidade: 'leilao',
                                localLeilao: item.lot_location || item.lot_location_address || 'Ver Site',
                                ano: item.lot_year_manufacture ? `${item.lot_year_manufacture}/${item.lot_year_model}` : item.lot_year_model,
                                previsao: { string: item.lot_date_end || '' },
                                tipo: 'veiculo'
                            };
                        }).filter(v => v.fotos.length > 0);

                        if (veiculos.length > 0) {
                            await db.salvarLista(veiculos);
                            capturados += veiculos.length;
                            console.log(`   🔸 [${SITE}] Capturados ${veiculos.length} itens do chunk API.`);
                        }
                    }
                } catch (e) { }
            }
        });

        const targetUrl = 'https://www.sodresantoro.com.br/veiculos/lotes?sort=lot_visits_desc';
        console.log(`🔍 [${SITE}] Abrindo listagem...`);
        await page.goto(targetUrl, { waitUntil: 'networkidle2', timeout: 60000 });

        // Deep scroll strategy: More rounds, faster scroll
        for (let round = 0; round < 20; round++) { // Increased to 20 rounds for deep discovery
            await autoScroll(page);

            const hasMore = await page.evaluate(() => {
                const btn = Array.from(document.querySelectorAll('button, a')).find(b =>
                    b.innerText.toLowerCase().includes('carregar mais') ||
                    b.innerText.toLowerCase().includes('ver mais')
                );
                if (btn) {
                    btn.click();
                    return true;
                }
                return false;
            });

            if (!hasMore && round > 5) break;
            await new Promise(r => setTimeout(r, 2000));
        }

    } catch (e) {
        console.error(`❌ [${SITE}] Erro:`, e.message);
    } finally {
        await browser.close();
        console.log(`✅ [${SITE}] Coleção finalizada: ${capturados} veículos encontrados.`);
    }
};

async function autoScroll(page) {
    await page.evaluate(async () => {
        await new Promise((resolve) => {
            let totalHeight = 0;
            let distance = 500;
            let timer = setInterval(() => {
                let scrollHeight = document.body.scrollHeight;
                window.scrollBy(0, distance);
                totalHeight += distance;
                if ((window.innerHeight + window.scrollY) >= scrollHeight - 300) {
                    clearInterval(timer);
                    resolve();
                }
            }, 100);
        });
    });
}

if (process.argv[1].includes('sodre')) {
    (async () => {
        const conn = await connectDatabase();
        await execute(conn);
        process.exit(0);
    })();
}

export default { execute };
