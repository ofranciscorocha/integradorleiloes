import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import dotenv from 'dotenv';

dotenv.config();
puppeteer.use(StealthPlugin());

const TIMEOUT = parseInt(process.env.CRAWLER_TIMEOUT_MS) || 45000;

const createCrawler = (db) => {
    const { salvarLista } = db;
    const SITE = 'guariglialeiloes.com.br';
    const BASE_URL = 'https://www.guariglialeiloes.com.br';

    const buscarTodos = async () => {
        console.log(`🚀 [${SITE}] Iniciando crawler (Puppeteer Mode)...`);

        const browser = await puppeteer.launch({
            headless: "new",
            args: ['--no-sandbox', '--disable-setuid-sandbox', '--window-size=1280,720']
        });

        const listaCompleta = [];
        try {
            // Use a page just to discover auction links
            const homePage = await browser.newPage();
            await homePage.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36');

            console.log(`🔍 [${SITE}] Navegando para home...`);
            await homePage.goto(BASE_URL, { waitUntil: 'networkidle2', timeout: TIMEOUT });

            // Busca links de leilões ativos
            const leilaoLinks = await homePage.evaluate(() => {
                const results = [];
                const links = document.querySelectorAll('a[href*="/leilao/"]');
                links.forEach(a => {
                    const href = a.href;
                    // Accept auction links that end with /lotes or contain /leilao/NUMBER
                    if (href.match(/\/leilao\/\d+/) && !results.includes(href)) {
                        // Normalize: add /lotes if not present
                        let normalizedHref = href;
                        if (!normalizedHref.includes('/lotes')) {
                            normalizedHref = normalizedHref.replace(/\/?$/, '/lotes');
                        }
                        // Remove query strings for dedup
                        const baseHref = normalizedHref.split('?')[0];
                        if (!results.includes(baseHref)) {
                            results.push(baseHref);
                        }
                    }
                });
                return results;
            });

            console.log(`✅ [${SITE}] Found ${leilaoLinks.length} auctions to process.`);
            await homePage.close();

            // Process each auction in a NEW page to avoid detached frame errors
            for (const link of leilaoLinks) {
                console.log(`📋 [${SITE}] Capturando leilão: ${link}`);
                let auctionPage = null;
                try {
                    auctionPage = await browser.newPage();
                    await auctionPage.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36');
                    await auctionPage.goto(link, { waitUntil: 'networkidle2', timeout: TIMEOUT });

                    // Aguarda lotes
                    await auctionPage.waitForSelector('.lote', { timeout: 10000 }).catch(() => null);

                    const itens = await auctionPage.evaluate((baseUrl, site) => {
                        const results = [];
                        const cards = document.querySelectorAll('.lote');

                        cards.forEach(card => {
                            const linkEl = card.querySelector('a[href*="/lote/"]');
                            const titleEl = card.querySelector('.body-lote p') || card.querySelector('h5');
                            const imgEl = card.querySelector('img');
                            const priceEl = card.querySelector('.lance_atual');

                            if (!linkEl) return;

                            const title = titleEl ? titleEl.innerText.split('\n')[0].trim() : 'VEÍCULO';
                            const url = linkEl.href;
                            const registro = url.split('/').filter(Boolean).pop();

                            results.push({
                                registro,
                                site: site,
                                veiculo: title.toUpperCase(),
                                link: url,
                                fotos: imgEl && imgEl.src ? [imgEl.src] : [],
                                valor: priceEl ? parseFloat(priceEl.innerText.replace(/[^0-9,]/g, '').replace(',', '.')) || 0 : 0,
                                localLeilao: 'SP'
                            });
                        });
                        return results;
                    }, BASE_URL, SITE);

                    if (itens.length > 0) {
                        await salvarLista(itens);
                        listaCompleta.push(...itens);
                        console.log(`   Saved ${itens.length} lots.`);
                    }
                } catch (err) {
                    console.error(`   Error on auction ${link}: ${err.message}`);
                } finally {
                    if (auctionPage) {
                        await auctionPage.close().catch(() => { });
                    }
                }
            }

        } catch (error) {
            console.error(`❌ [${SITE}] Erro:`, error.message);
        } finally {
            await browser.close();
        }
        return listaCompleta.length;
    };

    return { buscarTodos, SITE };
};

export default createCrawler;
