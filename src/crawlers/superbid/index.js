import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import dotenv from 'dotenv';

dotenv.config();
puppeteer.use(StealthPlugin());

const TIMEOUT = parseInt(process.env.CRAWLER_TIMEOUT_MS) || 90000;

const createCrawler = (db) => {
    const { salvarLista } = db;
    const SITE = 'superbid.net';
    const BASE_URL = 'https://www.superbid.net';

    const buscarTodos = async () => {
        console.log(`🚀 [${SITE}] SUPERCRAWLER: Iniciando captura massiva via API Intercept...`);

        const browser = await puppeteer.launch({
            headless: "new",
            protocolTimeout: 240000,
            args: ['--no-sandbox', '--disable-setuid-sandbox', '--window-size=1920,1080', '--disable-dev-shm-usage']
        });

        let capturados = 0;
        const allItems = [];

        try {
            const page = await browser.newPage();
            await page.setViewport({ width: 1920, height: 1080 });
            await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36');

            // Intercept API responses for lot data
            const capturedApiData = [];
            page.on('response', async response => {
                const url = response.url();
                if (url.includes('/api/') && (url.includes('lot') || url.includes('search') || url.includes('auction') || url.includes('vehicle'))) {
                    try {
                        const text = await response.text();
                        if (text.startsWith('{') || text.startsWith('[')) {
                            capturedApiData.push({ url, data: JSON.parse(text) });
                        }
                    } catch (e) { }
                }
            });

            // Strategy 1: Navigate to vehicle categories to discover API patterns
            const entryPoints = [
                `${BASE_URL}/leilao/veiculos`,
                `${BASE_URL}/exchange/veiculos`,
                `${BASE_URL}/exchange/carros`,
                `${BASE_URL}/exchange/motos`,
                `${BASE_URL}/exchange/caminhoes`
            ];

            for (const entry of entryPoints) {
                try {
                    console.log(`   🔍 [${SITE}] Navegando: ${entry}`);
                    await page.goto(entry, { waitUntil: 'domcontentloaded', timeout: TIMEOUT }).catch(() => null);
                    await new Promise(r => setTimeout(r, 3000));

                    // Deep scroll to trigger lazy loading
                    for (let i = 0; i < 30; i++) {
                        await page.evaluate(() => window.scrollBy(0, 800));
                        await new Promise(r => setTimeout(r, 500));
                    }

                    // Try clicking "load more" or pagination
                    for (let clickAttempt = 0; clickAttempt < 20; clickAttempt++) {
                        const clicked = await page.evaluate(() => {
                            const btns = Array.from(document.querySelectorAll('button, a'));
                            const loadMore = btns.find(b => {
                                const t = (b.innerText || '').toLowerCase();
                                return t.includes('carregar mais') || t.includes('ver mais') || t.includes('load more') || t.includes('mostrar mais');
                            });
                            if (loadMore) { loadMore.click(); return true; }

                            // Try next page
                            const nextPage = btns.find(b => {
                                const t = (b.innerText || '').toLowerCase();
                                return t.includes('próxim') || t === '>' || t === '»';
                            });
                            if (nextPage && !nextPage.disabled) { nextPage.click(); return true; }
                            return false;
                        });
                        if (!clicked) break;
                        await new Promise(r => setTimeout(r, 2000));
                        await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
                        await new Promise(r => setTimeout(r, 1000));
                    }

                    // Extract from DOM with safety timeout
                    let items = [];
                    try {
                        items = await page.evaluate((site) => {
                            const results = [];
                            const seen = new Set();
                            // Limit to first 300 cards to prevent timeout on huge pages
                            const cards = Array.from(document.querySelectorAll('.card, [class*="lot"], [class*="item"], [class*="product"]')).slice(0, 300);

                            cards.forEach(card => {
                                try {
                                    const linkEl = card.querySelector('a[href*="/leilao/"], a[href*="/exchange/"], a[href*="/lot/"], a[href]');
                                    if (!linkEl) return;

                                    const link = linkEl.href;
                                    if (seen.has(link)) return;
                                    seen.add(link);

                                    const text = card.innerText || '';
                                    if (text.length < 15) return;

                                    // Must have vehicle-like content
                                    const textUpper = text.toUpperCase();
                                    const brands = ['HONDA', 'TOYOTA', 'FIAT', 'VOLKSWAGEN', 'CHEVROLET', 'FORD', 'YAMAHA', 'HYUNDAI', 'RENAULT', 'JEEP', 'BMW', 'MERCEDES', 'NISSAN', 'MITSUBISHI', 'KIA', 'PEUGEOT', 'CITROEN', 'AUDI', 'VOLVO', 'PORSCHE', 'SUZUKI', 'KAWASAKI', 'HARLEY', 'LAND ROVER', 'IVECO', 'SCANIA', 'MAN', 'DAF'];
                                    const vehicleTerms = ['CARRO', 'MOTO', 'CAMINHÃO', 'CAMINHAO', 'VEÍCULO', 'VEICULO', 'AUTOMÓVEL', 'AUTOMOVEL', 'PICKUP', 'VAN', 'ÔNIBUS', 'ONIBUS', 'MOTOCICLETA'];
                                    const hasBrand = brands.some(b => textUpper.includes(b));
                                    const hasVehicleTerm = vehicleTerms.some(v => textUpper.includes(v));
                                    const hasYear = /20[0-2]\d/.test(text) || /19[89]\d/.test(text);

                                    if (!hasBrand && !hasVehicleTerm && !hasYear) return;

                                    // Blacklist
                                    const blacklist = ['IMOVEL', 'IMOVEIS', 'APARTAMENTO', 'TERRENO', 'CASA', 'FAZENDA', 'GALPAO', 'ESCRITORIO', 'MOVEIS', 'ELETRO', 'NOTEBOOK', 'CELULAR'];
                                    if (blacklist.some(b => textUpper.includes(b))) return;

                                    const imgEl = card.querySelector('img');
                                    const priceMatch = text.match(/R\$\s?[\d.,]+/);
                                    const yearMatch = text.match(/(20[0-2]\d|19[89]\d)/);
                                    const title = text.split('\n').filter(l => l.trim().length > 5)[0] || 'Veículo Superbid';

                                    results.push({
                                        registro: link.split('/').pop().split('?')[0] || Date.now().toString(36),
                                        site: site,
                                        link: link,
                                        veiculo: title.trim().toUpperCase().substring(0, 120),
                                        fotos: imgEl && imgEl.src && !imgEl.src.includes('placeholder') ? [imgEl.src] : [],
                                        valor: priceMatch ? parseFloat(priceMatch[0].replace('R$', '').replace(/\./g, '').replace(',', '.').trim()) || 0 : 0,
                                        ano: yearMatch ? parseInt(yearMatch[1]) : null,
                                        localLeilao: 'Brasil',
                                        modalidade: 'leilao',
                                        tipo: 'veiculo'
                                    });
                                } catch (e) { }
                            });
                            return results;
                        }, SITE);
                    } catch (e) {
                        console.log(`   ⚠️ [${SITE}] Timeout ou erro na extração DOM: ${e.message}`);
                    }

                    if (items.length > 0) {
                        // Deduplicate against existing
                        const newItems = items.filter(i => !allItems.some(a => a.link === i.link));
                        allItems.push(...newItems);
                        console.log(`   ✅ [${SITE}] +${newItems.length} veículos extraídos de ${entry}. Total: ${allItems.length}`);
                    }

                } catch (e) {
                    console.log(`   ⚠️ [${SITE}] Erro em ${entry}: ${e.message}`);
                }
            }

            // Process any API data captured
            for (const apiEntry of capturedApiData) {
                try {
                    const data = apiEntry.data;
                    const lots = data.results || data.lots || data.items || data.data || (Array.isArray(data) ? data : []);

                    for (const item of lots) {
                        if (typeof item !== 'object') continue;
                        const title = item.title || item.name || item.description || item.lot_title || '';
                        const link = item.url || item.link || `${BASE_URL}/item/${item.id || item.lot_id || ''}`;
                        const photos = item.images || item.photos || item.pictures || item.lot_pictures || [];

                        if (title && !allItems.some(a => a.link === link)) {
                            allItems.push({
                                registro: String(item.id || item.lot_id || Date.now().toString(36)),
                                site: SITE,
                                link: link,
                                veiculo: title.toUpperCase().substring(0, 120),
                                fotos: Array.isArray(photos) ? photos.slice(0, 5) : photos ? [photos] : [],
                                valor: parseFloat(item.price || item.current_bid || item.initial_bid || item.valor || 0),
                                ano: item.year || item.ano || null,
                                localLeilao: item.location || item.city || 'Brasil',
                                modalidade: 'leilao',
                                tipo: 'veiculo'
                            });
                        }
                    }
                } catch (e) { }
            }

            // Save all 
            if (allItems.length > 0) {
                // Save in batches of 200
                for (let i = 0; i < allItems.length; i += 200) {
                    const batch = allItems.slice(i, i + 200);
                    await salvarLista(batch);
                    console.log(`   💾 [${SITE}] Salvando batch ${Math.floor(i / 200) + 1}: ${batch.length} itens`);
                }
                capturados = allItems.length;
            }

        } catch (error) {
            console.error(`❌ [${SITE}] Erro Fatal:`, error.message);
        } finally {
            await browser.close();
        }

        console.log(`✅ [${SITE}] Finalizado! ${capturados} veículos coletados.`);
        return capturados;
    };

    return { buscarTodos, SITE };
};

export default createCrawler;
