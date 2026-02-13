import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import dotenv from 'dotenv';

dotenv.config();
puppeteer.use(StealthPlugin());

const TIMEOUT = parseInt(process.env.CRAWLER_TIMEOUT_MS) || 60000;
const CONCURRENCY = 2;

const createCrawler = (db) => {
    const { salvarLista } = db;
    const SITE = 'leilo.com.br';
    const BASE_URL = 'https://www.leilo.com.br';

    const crawlAuction = async (browser, link) => {
        console.log(`📋 [${SITE}] Capturando leilão: ${link}`);
        const page = await browser.newPage();
        const results = [];
        try {
            await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36');

            let currentUrl = link;
            let pageNum = 1;
            while (currentUrl && pageNum <= 10) {
                await page.goto(currentUrl, { waitUntil: 'networkidle2', timeout: TIMEOUT });
                await page.waitForSelector('a[href*="/item/"]', { timeout: 15000 }).catch(() => null);
                await autoScroll(page);

                const itens = await page.evaluate((site) => {
                    const found = [];
                    const cards = document.querySelectorAll('.lote, .item-lote, div[class*="item"], .lot-card, [class*="LotCard"]');

                    cards.forEach(card => {
                        const linkEl = card.querySelector('a[href*="/item/"]');
                        const titleEl = card.querySelector('h5, .body-lote p, .desc-lote, .name, .title');
                        const imgEl = card.querySelector('img');
                        const priceEl = card.querySelector('.lance_atual, .valor-lote, .price, .value');

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
                            localLeilao: 'BR',
                            modalidade: 'leilao',
                            tipo: 'veiculo'
                        });
                    });
                    return found;
                }, SITE);

                if (itens.length > 0) {
                    const filtered = itens.filter(item => {
                        const text = item.veiculo.toUpperCase();
                        const blacklist = ['MOVEIS', 'ELETRO', 'INFORMÁTICA', 'SUCATA DE FERRO', 'PEÇAS', 'IMOVEL', 'TERRENO'];
                        return !blacklist.some(b => text.includes(b));
                    });
                    results.push(...filtered);
                    console.log(`   ✅ [${SITE}] Página ${pageNum}: ${itens.length} detectados, ${filtered.length} filtrados.`);
                }

                const nextLink = await page.evaluate(() => {
                    const next = Array.from(document.querySelectorAll('.pagination a, .next a')).find(a =>
                        a.innerText.includes('»') || a.innerText.toLowerCase().includes('próximo')
                    );
                    return next && next.href ? next.href : null;
                });

                if (nextLink && nextLink !== currentUrl) {
                    currentUrl = nextLink;
                    pageNum++;
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
        console.log(`🚀 [${SITE}] HIGH-YIELD: Iniciando captura via Iterador de Leilões...`);

        const browser = await puppeteer.launch({
            headless: "new",
            args: ['--no-sandbox', '--disable-setuid-sandbox', '--window-size=1920,1080']
        });

        const listaTotal = [];
        try {
            const page = await browser.newPage();
            await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36');

            console.log(`🔍 [${SITE}] Mapeando leilões ativos via Entry Points...`);
            const auctionLinks = new Set();
            const discoveryUrls = [`${BASE_URL}/leilao`, `${BASE_URL}/agenda`, `${BASE_URL}/veiculos`];

            for (const dUrl of discoveryUrls) {
                try {
                    console.log(`   🧭 [${SITE}] Verificando: ${dUrl}`);
                    await page.goto(dUrl, { waitUntil: 'networkidle2', timeout: TIMEOUT });
                    const found = await page.evaluate(() => {
                        const links = [];
                        document.querySelectorAll('a[href*="/leilao/"]').forEach(a => {
                            if (!a.href.includes('/agenda') && !a.href.includes('/realizados')) {
                                links.push(a.href);
                            }
                        });
                        return links;
                    });
                    found.forEach(l => auctionLinks.add(l));
                } catch (e) { }
            }

            const linksArray = [...auctionLinks];
            console.log(`✅ [${SITE}] ${linksArray.length} leilões encontrados. Processando com pool...`);

            for (let i = 0; i < linksArray.length; i += CONCURRENCY) {
                const chunk = linksArray.slice(i, i + CONCURRENCY);
                const results = await Promise.all(chunk.map(link => crawlAuction(browser, link)));
                const flattened = results.flat();

                if (flattened.length > 0) {
                    await salvarLista(flattened);
                    listaTotal.push(...flattened);
                }
            }

        } catch (e) {
            console.error(`❌ [${SITE}] Erro Fatal:`, e.message);
        } finally {
            await browser.close();
        }
        console.log(`✅ [${SITE}] Sucesso! ${listaTotal.length} veículos coletados.`);
        return listaTotal.length;
    };

    return { buscarTodos, SITE };
};

async function autoScroll(page) {
    await page.evaluate(async () => {
        await new Promise((resolve) => {
            let totalHeight = 0;
            let distance = 400;
            let timer = setInterval(() => {
                let scrollHeight = document.body.scrollHeight;
                window.scrollBy(0, distance);
                totalHeight += distance;
                if (totalHeight >= scrollHeight) {
                    clearInterval(timer);
                    resolve();
                }
            }, 100);
        });
    });
}

export default createCrawler;
