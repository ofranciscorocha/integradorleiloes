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
    console.log(`--- Iniciando Crawler ${SITE} (API Capture) ---`);

    const browser = await puppeteer.launch({
        headless: "new",
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--window-size=1920,1080']
    });

    let capturados = 0;

    try {
        const page = await browser.newPage();

        await page.setRequestInterception(true);
        page.on('request', (req) => {
            if (req.resourceType() === 'image' || req.resourceType() === 'font') req.abort();
            else req.continue();
        });

        page.on('response', async response => {
            const url = response.url();

            // Target the clean API endpoint found in analysis
            if (url.includes('api/search-lots')) {
                try {
                    const data = await response.json();

                    if (data && data.results && Array.isArray(data.results)) {
                        console.log(`Intercepted API: ${data.results.length} items`);

                        const veiculos = data.results.map(item => {
                            // Extract fields based on sorde-payload-1770764617710.json analysis

                            // Link construction: https://www.sodresantoro.com.br/leilao/ID_LEILAO/lote/ID_LOTE
                            const link = `https://www.sodresantoro.com.br/leilao/${item.auction_id}/lote/${item.lot_id}`;

                            return {
                                registro: String(item.lot_id || item.id),
                                site: 'sodresantoro.com.br',
                                link: link,
                                veiculo: item.lot_title || item.lot_description || 'Veículo Sodré',
                                fotos: item.lot_pictures || [],
                                valor: parseFloat(item.bid_actual || item.bid_initial || 0),
                                modalidade: 'leilao',
                                localLeilao: item.lot_location || item.lot_location_address || 'Ver Site',
                                ano: item.lot_year_manufacture ? `${item.lot_year_manufacture}/${item.lot_year_model}` : item.lot_year_model,
                                previsao: {
                                    string: item.lot_date_end // e.g. "2026-02-12 09:48:00"
                                },
                                dataInicio: item.lot_date_end ? new Date(item.lot_date_end).getTime() : null
                            };
                        }).filter(v => v.fotos.length > 0 && !v.veiculo.includes('Veículo Sodré'));

                        if (veiculos.length > 0) {
                            await db.salvarLista(veiculos);
                            capturados += veiculos.length;
                            console.log(`Saved ${veiculos.length} vehicles from API chunk.`);
                        }
                    }
                } catch (e) {
                    // Silent fail for non-json or parse errors on other calls
                }
            }
        });

        const url = 'https://www.sodresantoro.com.br/veiculos/lotes?sort=lot_visits_desc';
        console.log(`Navigating to ${url}...`);
        await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });

        // Scroll to trigger search-lots API calls, with multiple rounds
        for (let round = 0; round < 5; round++) {
            await autoScroll(page);

            // Try clicking "Load More" / "Carregar mais" buttons
            const clicked = await page.evaluate(() => {
                const buttons = Array.from(document.querySelectorAll('button, a'));
                for (const btn of buttons) {
                    const text = btn.innerText.toLowerCase();
                    if (text.includes('carregar mais') || text.includes('load more') || text.includes('ver mais')) {
                        btn.click();
                        return true;
                    }
                }
                return false;
            });

            if (clicked) {
                console.log(`   Clicked load more (round ${round + 1})`);
                await new Promise(r => setTimeout(r, 3000));
            } else {
                // No more load buttons, we're done
                break;
            }
        }

        // Final wait for any pending API responses
        await new Promise(r => setTimeout(r, 2000));

    } catch (e) {
        console.error('Erro Sodré:', e.message);
    } finally {
        await browser.close();
        console.log(`--- Finalizado Sodré: ${capturados} itens ---`);
    }
};

async function autoScroll(page) {
    await page.evaluate(async () => {
        await new Promise((resolve) => {
            var totalHeight = 0;
            var distance = 300;
            var retries = 0;
            var maxRetries = 50;

            var timer = setInterval(() => {
                var scrollHeight = document.body.scrollHeight;
                window.scrollBy(0, distance);
                totalHeight += distance;

                if ((window.innerHeight + window.scrollY) >= scrollHeight - 100) {
                    retries++;
                    if (retries >= maxRetries) {
                        clearInterval(timer);
                        resolve();
                    }
                } else {
                    retries = 0;
                }
            }, 200);
        });
    });
}

// Standalone runner
if (process.argv[1].includes('sodre')) {
    (async () => {
        const conn = await connectDatabase();
        await execute(conn);
        process.exit(0);
    })();
}

export default { execute };
