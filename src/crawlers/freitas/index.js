import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import dotenv from 'dotenv';

dotenv.config();
puppeteer.use(StealthPlugin());

const TIMEOUT = parseInt(process.env.CRAWLER_TIMEOUT_MS) || 60000;
const CONCURRENCY = 2;

const createCrawler = (db) => {
    const { salvarLista } = db;
    const SITE = 'freitasleiloeiro.com.br';
    const BASE_URL = 'https://www.freitasleiloeiro.com.br';

    const crawlAuction = async (browser, link) => {
        console.log(`📋 [${SITE}] Capturando leilão: ${link}`);
        const page = await browser.newPage();
        const results = [];
        try {
            await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36');

            let currentUrl = link;
            while (currentUrl) {
                await page.goto(currentUrl, { waitUntil: 'networkidle2', timeout: TIMEOUT });
                await page.waitForSelector('.cardlote', { timeout: 15000 }).catch(() => null);

                const itens = await page.evaluate((site) => {
                    const found = [];
                    const cards = document.querySelectorAll('.cardlote');

                    cards.forEach(card => {
                        const linkEl = card.querySelector('a');
                        const titleEl = card.querySelector('.cardLote-descVeic');
                        const imgEl = card.querySelector('.cardLote-img');
                        const priceEl = card.querySelector('.cardLote-vlr');

                        if (!linkEl || !titleEl) return;

                        const title = titleEl.innerText.trim();
                        const url = linkEl.href;
                        const registro = card.querySelector('.cardLote-lote')?.innerText.replace('Lote:', '').trim() || url.split('=').pop();

                        found.push({
                            registro,
                            site: site,
                            veiculo: title.toUpperCase(),
                            link: url,
                            fotos: imgEl && imgEl.src ? [imgEl.src] : [],
                            valor: priceEl ? parseFloat(priceEl.innerText.replace(/[^0-9,]/g, '').replace(',', '.')) || 0 : 0,
                            localLeilao: 'SP',
                            modalidade: 'leilao',
                            tipo: 'veiculo'
                        });
                    });
                    return found;
                }, SITE);

                results.push(...itens);

                // Check for next page inside auction
                const nextLink = await page.evaluate(() => {
                    const next = Array.from(document.querySelectorAll('.pagination a')).find(a =>
                        a.innerText.includes('Próximo') || a.innerText.includes('>>')
                    );
                    return next ? next.href : null;
                });

                if (nextLink && nextLink !== currentUrl) {
                    currentUrl = nextLink;
                } else {
                    currentUrl = null;
                }
            }
        } catch (e) {
            console.error(`   ❌ [${SITE}] Erro no leilão ${link}:`, e.message);
        } finally {
            await page.close();
        }
        return results;
    };

    const buscarTodos = async () => {
        console.log(`🚀 [${SITE}] HIGH-YIELD: Iniciando captura profunda...`);

        const browser = await puppeteer.launch({
            headless: "new",
            args: ['--no-sandbox', '--disable-setuid-sandbox']
        });

        const listaTotal = [];
        try {
            const page = await browser.newPage();
            await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36');

            console.log(`🔍 [${SITE}] Mapeando agenda de leilões...`);
            // We use the search page with vehicles as base for broad discovery
            await page.goto(`${BASE_URL}/Leiloes/PesquisarLotes?Categoria=1`, { waitUntil: 'networkidle2', timeout: TIMEOUT });

            const auctionLinks = await page.evaluate(() => {
                const links = new Set();
                // Find links to specific auctions from cards or sidebar
                document.querySelectorAll('a[href*="Leilao="]').forEach(a => {
                    const m = a.href.match(/Leilao=(\d+)/);
                    if (m) links.add(`https://www.freitasleiloeiro.com.br/Leiloes/PesquisarLotes?Leilao=${m[1]}`);
                });
                return [...links];
            });

            console.log(`✅ [${SITE}] ${auctionLinks.length} leilões detectados. Iniciando processamento paralelo...`);
            await page.close();

            if (auctionLinks.length === 0) {
                // Fallback to simple search if no specific auctions found
                console.log(`⚠️ [${SITE}] Nenhum leilão específico detectado. Usando busca global...`);
                return await executeSimple(browser, db);
            }

            for (let i = 0; i < auctionLinks.length; i += CONCURRENCY) {
                const chunk = auctionLinks.slice(i, i + CONCURRENCY);
                const chunkResults = await Promise.all(chunk.map(link => crawlAuction(browser, link)));

                const filtered = chunkResults.flat().filter(item => {
                    const text = item.veiculo.toUpperCase();
                    const blacklist = ['MOVEIS', 'ELETRO', 'INFORMÁTICA', 'SUCATA DE FERRO', 'IMOVEL', 'TERRENO'];
                    return !blacklist.some(b => text.includes(b));
                });

                if (filtered.length > 0) {
                    await salvarLista(filtered);
                    listaTotal.push(...filtered);
                }
                console.log(`   🔸 [Pool] Processado lote ${Math.floor(i / CONCURRENCY) + 1}. Total: ${listaTotal.length} veículos.`);
            }

        } catch (error) {
            console.error(`❌ [${SITE}] Erro:`, error.message);
        } finally {
            await browser.close();
        }
        return listaTotal.length;
    };

    const executeSimple = async (browser, db) => {
        const page = await browser.newPage();
        let total = 0;
        try {
            for (let p = 1; p <= 100; p++) {
                const url = `${BASE_URL}/Leiloes/PesquisarLotes?Categoria=1&PageNumber=${p}`;
                await page.goto(url, { waitUntil: 'networkidle2', timeout: TIMEOUT });
                await page.waitForSelector('.cardlote', { timeout: 15000 }).catch(() => null);

                const itens = await page.evaluate(() => {
                    // Same extraction logic as crawlAuction...
                    const found = [];
                    document.querySelectorAll('.cardlote').forEach(card => {
                        const linkEl = card.querySelector('a');
                        const titleEl = card.querySelector('.cardLote-descVeic');
                        if (!linkEl || !titleEl) return;
                        found.push({
                            veiculo: titleEl.innerText.trim().toUpperCase(),
                            link: linkEl.href,
                            registro: card.querySelector('.cardLote-lote')?.innerText.replace('Lote:', '').trim() || linkEl.href.split('=').pop(),
                            fotos: card.querySelector('.cardLote-img') ? [card.querySelector('.cardLote-img').src] : [],
                            valor: parseFloat(card.querySelector('.cardLote-vlr')?.innerText.replace(/[^0-9,]/g, '').replace(',', '.')) || 0
                        });
                    });
                    return found;
                });

                if (itens.length === 0) break;

                const filtered = itens.map(item => ({
                    ...item,
                    site: SITE,
                    localLeilao: 'SP',
                    modalidade: 'leilao',
                    tipo: 'veiculo'
                }));

                await db.salvarLista(filtered);
                total += filtered.length;
            }
        } finally {
            await page.close();
        }
        return total;
    };

    return { buscarTodos, SITE };
};

export const execute = async (db) => {
    const crawler = createCrawler(db);
    return await crawler.buscarTodos();
};

export default createCrawler;
