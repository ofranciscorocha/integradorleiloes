import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import dotenv from 'dotenv';

dotenv.config();
puppeteer.use(StealthPlugin());

const TIMEOUT = parseInt(process.env.CRAWLER_TIMEOUT_MS) || 90000;

const createCrawler = (db) => {
    const { salvarLista } = db;
    const SITE = 'vipleiloes.com.br';
    const BASE_URL = 'https://www.vipleiloes.com.br';

    const buscarTodos = async () => {
        console.log(`🚀 [${SITE}] SUPERCRAWLER: Iniciando captura via Infinite Scroll DOM...`);

        const browser = await puppeteer.launch({
            headless: "new",
            args: ['--no-sandbox', '--disable-setuid-sandbox', '--window-size=1920,1080', '--disable-dev-shm-usage']
        });

        let capturados = 0;

        try {
            const page = await browser.newPage();
            await page.setViewport({ width: 1920, height: 1080 });
            await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36');

            // Establish session
            console.log(`   🔍 [${SITE}] Estabelecendo sessão...`);
            await page.goto(BASE_URL, { waitUntil: 'domcontentloaded', timeout: TIMEOUT });
            await new Promise(r => setTimeout(r, 2000));

            const seenIds = new Set();
            const categories = [
                'Seminovos', 'Usados', 'Motos', 'Sinistrados', 'Pesados', 'Diversos'
            ];

            let totalInfinities = 0;

            for (const cat of categories) {
                const targetUrl = `${BASE_URL}/pesquisa?classificacao=${cat}`;
                console.log(`   🔍 [${SITE}] Capturando categoria: ${cat}...`);

                try {
                    await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: TIMEOUT });

                    // Wait for any listing result or a short timeout
                    await page.waitForSelector('a[href*="/evento/anuncio/"]', { timeout: 10000 }).catch(() => null);

                    // Infinite Scroll
                    let lastCount = 0;
                    for (let i = 0; i < 30; i++) {
                        const currentCount = await page.evaluate(() => {
                            window.scrollBy(0, 1000);
                            return document.querySelectorAll('a[href*="/evento/anuncio/"], [class*="card-anuncio"], .card, [class*="lote-item"]').length;
                        });

                        if (currentCount > lastCount) {
                            lastCount = currentCount;
                        } else if (i > 5) {
                            break;
                        }

                        await new Promise(r => setTimeout(r, 1500));

                        // Try clicking "Ver mais"
                        await page.evaluate(() => {
                            const btns = Array.from(document.querySelectorAll('button, a.btn'));
                            const loadMore = btns.find(b => {
                                const t = b.innerText || '';
                                return t.toLowerCase().includes('ver mais') || t.toLowerCase().includes('carregar mais');
                            });
                            if (loadMore) { loadMore.click(); return true; }
                            return false;
                        });
                    }

                    // Scrape
                    const items = await page.evaluate((site, category) => {
                        const results = [];
                        const cards = document.querySelectorAll('a[href*="/evento/anuncio/"], [class*="card-anuncio"], .card');
                        const seenInPage = new Set();

                        cards.forEach(card => {
                            const linkEl = (card.tagName === 'A') ? card : card.querySelector('a[href*="/evento/anuncio/"]');
                            if (!linkEl) return;

                            const link = linkEl.href;
                            if (seenInPage.has(link)) return;
                            seenInPage.add(link);

                            const text = card.innerText || '';
                            const id = link.split('/').pop().split('-').pop();

                            results.push({
                                registro: id,
                                site: site,
                                link: link,
                                veiculo: text.split('\n')[0].toUpperCase().trim(),
                                categoria: category,
                                raw: text
                            });
                        });
                        return results;
                    }, SITE, cat);

                    const uniqueItems = items.filter(it => !seenIds.has(it.link));
                    uniqueItems.forEach(it => seenIds.add(it.link));

                    if (uniqueItems.length > 0) {
                        const batch = uniqueItems.map(it => {
                            const { raw, ...base } = it;
                            const priceMatch = raw.match(/R\$\s?[\d.,]+/);
                            const yearMatch = raw.match(/(\d{4})\/(\d{4})/) || raw.match(/(20[0-2]\d|19[89]\d)/);

                            return {
                                ...base,
                                veiculo: (base.veiculo || 'VEÍCULO VIP').substring(0, 150),
                                valor: priceMatch ? parseFloat(priceMatch[0].replace('R$', '').replace(/\./g, '').replace(',', '.').trim()) : 0,
                                ano: yearMatch ? (yearMatch[1].length === 4 ? yearMatch[1] : yearMatch[0]) : null,
                                modalidade: 'leilao',
                                tipo: 'veiculo'
                            };
                        });

                        await db.salvarLista(batch);
                        totalInfinities += batch.length;
                        console.log(`     ✅ [${SITE}] ${cat}: +${batch.length} veículos. Total: ${totalInfinities}`);
                    }
                } catch (catErr) {
                    console.error(`     ⚠️ [${SITE}] Erro na categoria ${cat}:`, catErr.message);
                }
            }
            capturados = totalInfinities;

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

// Auto-execute if run directly
if (process.argv[1] && process.argv[1].includes('vipleiloes')) {
    (async () => {
        try {
            const module = await import('../../database/db.js');
            const connectDatabase = module.default;
            const db = await connectDatabase();
            const crawler = createCrawler(db);
            await crawler.buscarTodos();
            process.exit(0);
        } catch (err) {
            console.error('Core Error:', err);
            process.exit(1);
        }
    })();
}

export default createCrawler;
