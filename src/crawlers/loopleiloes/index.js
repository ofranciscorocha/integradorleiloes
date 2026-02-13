import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import dotenv from 'dotenv';

dotenv.config();
puppeteer.use(StealthPlugin());

const TIMEOUT = parseInt(process.env.CRAWLER_TIMEOUT_MS) || 90000;

const createCrawler = (db) => {
    const { salvarLista } = db;
    const SITE = 'loopleiloes.com.br';
    const BASE_URL = 'https://www.loopleiloes.com.br';

    const buscarTodos = async () => {
        console.log(`🚀 [${SITE}] SUPERCRAWLER: Iniciando captura via API Intercept...`);

        const browser = await puppeteer.launch({
            headless: "new",
            args: ['--no-sandbox', '--disable-setuid-sandbox', '--window-size=1920,1080', '--disable-dev-shm-usage']
        });

        let capturados = 0;

        try {
            const page = await browser.newPage();
            await page.setViewport({ width: 1920, height: 1080 });
            await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36');

            // Capture API payloads - Loop uses Next.js / GraphQL or REST API
            const capturedData = [];
            page.on('response', async response => {
                const url = response.url();
                if ((url.includes('api') || url.includes('_next/data') || url.includes('graphql')) &&
                    (url.includes('vehicle') || url.includes('lot') || url.includes('search') || url.includes('auction'))) {
                    try {
                        const text = await response.text();
                        if (text.startsWith('{') || text.startsWith('[')) {
                            capturedData.push(JSON.parse(text));
                        }
                    } catch (e) { }
                }
            });

            // Navigate to vehicle listing pages
            const entryPoints = [
                `${BASE_URL}/leiloes`,
                `${BASE_URL}/veiculos`,
                `${BASE_URL}/carros`,
                `${BASE_URL}/motos`,
            ];

            const allItems = [];
            const seenLinks = new Set();

            for (const entry of entryPoints) {
                try {
                    console.log(`   🔍 [${SITE}] Navegando: ${entry}`);
                    await page.goto(entry, { waitUntil: 'domcontentloaded', timeout: TIMEOUT }).catch(() => null);
                    await new Promise(r => setTimeout(r, 3000));

                    // Aggressive pagination - keep scrolling and clicking
                    let prevCount = 0;
                    for (let attempt = 0; attempt < 50; attempt++) {
                        // Scroll down
                        await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
                        await new Promise(r => setTimeout(r, 1000));

                        // Try load more/next page
                        await page.evaluate(() => {
                            const btns = Array.from(document.querySelectorAll('button, a'));
                            const loadMore = btns.find(b => {
                                const t = (b.innerText || '').toLowerCase();
                                return t.includes('carregar mais') || t.includes('ver mais') || t.includes('próximo') || t.includes('próxima');
                            });
                            if (loadMore) loadMore.click();
                        });
                        await new Promise(r => setTimeout(r, 1500));

                        // Count current elements
                        const currentCount = await page.evaluate(() => {
                            return document.querySelectorAll('a[href*="/leilao/"], a[href*="/lote/"], a[href*="/veiculo/"], .card, [class*="lot"]').length;
                        });

                        if (currentCount === prevCount && attempt > 5) break;
                        prevCount = currentCount;
                    }

                    // Extract from DOM  
                    const items = await page.evaluate((site) => {
                        const results = [];
                        const seen = new Set();
                        const cards = document.querySelectorAll('.card, [class*="lot"], [class*="card"], [class*="item"], article, [class*="vehicle"]');

                        cards.forEach(card => {
                            try {
                                const linkEl = card.querySelector('a');
                                if (!linkEl) return;

                                const link = linkEl.href;
                                if (seen.has(link)) return;
                                seen.add(link);

                                const text = card.innerText || '';
                                if (text.length < 15) return;

                                const textUpper = text.toUpperCase();

                                // Vehicle detection
                                const brands = ['HONDA', 'TOYOTA', 'FIAT', 'VOLKSWAGEN', 'CHEVROLET', 'FORD', 'YAMAHA', 'HYUNDAI', 'RENAULT', 'JEEP', 'BMW', 'MERCEDES', 'NISSAN', 'MITSUBISHI', 'KIA', 'PEUGEOT', 'CITROEN', 'AUDI', 'VOLVO', 'PORSCHE', 'SUZUKI', 'KAWASAKI', 'IVECO', 'SCANIA'];
                                const hasContent = brands.some(b => textUpper.includes(b)) || /20[0-2]\d/.test(text) || textUpper.includes('VEÍCULO') || textUpper.includes('VEICULO');

                                // Blacklist
                                const blacklist = ['IMOVEL', 'APARTAMENTO', 'TERRENO', 'CASA', 'FAZENDA', 'GALPAO', 'MOVEIS', 'ELETRO'];
                                if (blacklist.some(b => textUpper.includes(b)) && !hasContent) return;
                                if (!hasContent) return;

                                const imgEl = card.querySelector('img');
                                const priceMatch = text.match(/R\$\s?[\d.,]+/);
                                const yearMatch = text.match(/(20[0-2]\d|19[89]\d)/);
                                const title = text.split('\n').filter(l => l.trim().length > 5)[0] || 'Veículo Loop';

                                results.push({
                                    registro: link.split('/').pop().split('?')[0],
                                    site: site,
                                    link: link,
                                    veiculo: title.trim().toUpperCase().substring(0, 120),
                                    fotos: imgEl && imgEl.src && !imgEl.src.includes('data:image') ? [imgEl.src] : [],
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

                    const newItems = items.filter(i => !seenLinks.has(i.link));
                    newItems.forEach(i => seenLinks.add(i.link));
                    allItems.push(...newItems);

                    if (newItems.length > 0) {
                        console.log(`   ✅ [${SITE}] +${newItems.length} de ${entry}. Total: ${allItems.length}`);
                    }

                } catch (e) {
                    console.log(`   ⚠️ [${SITE}] Erro em ${entry}: ${e.message}`);
                }
            }

            // Process captured API data
            for (const data of capturedData) {
                try {
                    const items = data.results || data.lots || data.vehicles || data.items || data.data || (Array.isArray(data) ? data : []);
                    for (const item of items) {
                        if (typeof item !== 'object') continue;
                        const title = item.title || item.name || item.description || '';
                        const link = item.url || item.link || `${BASE_URL}/lote/${item.id || ''}`;
                        if (title && !seenLinks.has(link)) {
                            seenLinks.add(link);
                            allItems.push({
                                registro: String(item.id || item.lot_id || Date.now().toString(36)),
                                site: SITE,
                                link: link,
                                veiculo: title.toUpperCase().substring(0, 120),
                                fotos: Array.isArray(item.images || item.photos) ? (item.images || item.photos).slice(0, 5) : [],
                                valor: parseFloat(item.price || item.current_bid || item.valor || 0),
                                ano: item.year || null,
                                localLeilao: item.location || item.city || 'Brasil',
                                modalidade: 'leilao',
                                tipo: 'veiculo'
                            });
                        }
                    }
                } catch (e) { }
            }

            if (allItems.length > 0) {
                for (let i = 0; i < allItems.length; i += 200) {
                    await salvarLista(allItems.slice(i, i + 200));
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
