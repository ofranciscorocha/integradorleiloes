import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import dotenv from 'dotenv';

dotenv.config();
puppeteer.use(StealthPlugin());

const TIMEOUT = parseInt(process.env.CRAWLER_TIMEOUT_MS) || 60000;
const CONCURRENCY = 2; // Process 2 auctions in parallel

const createCrawler = (db) => {
    const { salvarLista } = db;
    const SITE = 'guariglialeiloes.com.br';
    const BASE_URL = 'https://www.guariglialeiloes.com.br';

    const crawlAuction = async (browser, link) => {
        console.log(`📋 [${SITE}] Capturando leilão: ${link}`);
        const page = await browser.newPage();
        const results = [];
        try {
            await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36');

            // Loop for pagination within the auction
            let currentUrl = link;
            while (currentUrl) {
                await page.goto(currentUrl, { waitUntil: 'networkidle2', timeout: TIMEOUT });

                // Wait for any lot identifier
                await page.waitForSelector('a[href*="/item/"]', { timeout: 15000 }).catch(() => null);

                const itens = await page.evaluate((site) => {
                    const found = [];
                    // Look for common card structures
                    const cards = document.querySelectorAll('.lote, .item-lote, div[class*="item"]');

                    cards.forEach(card => {
                        const linkEl = card.querySelector('a[href*="/item/"]');
                        // Try to find title in h5, p, or inside the link text
                        const titleEl = card.querySelector('h5, .body-lote p, .desc-lote');
                        const imgEl = card.querySelector('img');
                        const priceEl = card.querySelector('.lance_atual, .valor-lote');

                        if (!linkEl) return;

                        const title = titleEl ? titleEl.innerText.trim() : linkEl.innerText.trim();
                        if (!title || title.length < 5) return;

                        const url = linkEl.href;
                        const registro = url.split('/item/')[1]?.split('/')[0] || url.split('/').pop();

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

                // Next page detection
                const nextLink = await page.evaluate(() => {
                    const next = Array.from(document.querySelectorAll('.pagination a, .next a')).find(a =>
                        a.innerText.includes('»') || a.innerText.toLowerCase().includes('próximo')
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
            await page.goto(`${BASE_URL}/leiloes`, { waitUntil: 'networkidle2', timeout: TIMEOUT });

            const auctionLinks = await page.evaluate(() => {
                const links = new Set();
                document.querySelectorAll('a[href*="/leilao/"]').forEach(a => {
                    let href = a.href.split('?')[0]; // Remove query
                    if (href.match(/\/leilao\/\d+$/) || href.endsWith('/lotes')) {
                        if (!href.endsWith('/lotes')) href += '/lotes';
                        links.add(href);
                    }
                });
                return [...links];
            });

            console.log(`✅ [${SITE}] ${auctionLinks.length} leilões encontrados. Processando com pool...`);
            await page.close();

            // Process with concurrency
            for (let i = 0; i < auctionLinks.length; i += CONCURRENCY) {
                const chunk = auctionLinks.slice(i, i + CONCURRENCY);
                const chunkResults = await Promise.all(chunk.map(link => crawlAuction(browser, link)));

                const filtered = chunkResults.flat().filter(item => {
                    const text = item.veiculo.toUpperCase();
                    const blacklist = ['MOVEIS', 'ELETRO', 'INFORMÁTICA', 'SUCATA DE FERRO', 'PEÇAS', 'IMOVEL', 'TERRENO'];
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
        console.log(`✅ [${SITE}] Sucesso! ${listaTotal.length} veículos coletados.`);
        return listaTotal.length;
    };

    return { buscarTodos, SITE };
};

export default createCrawler;
