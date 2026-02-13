import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import dotenv from 'dotenv';

dotenv.config();
puppeteer.use(StealthPlugin());

const TIMEOUT = parseInt(process.env.CRAWLER_TIMEOUT_MS) || 60000;
const CONCURRENCY = 3;

const createCrawler = (db) => {
    const { salvarLista } = db;
    const SITE = 'rogeriomenezes.com.br';
    const BASE = 'https://www.rogeriomenezes.com.br';

    const crawlAuction = async (browser, auctionLink) => {
        const url = auctionLink.startsWith('http') ? auctionLink : `${BASE}${auctionLink}`;
        const page = await browser.newPage();
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36');

        const auctionVehicles = [];
        try {
            console.log(`   📋 [${idFromUrl(url)}] Acessando leilão...`);
            await page.goto(url, { waitUntil: 'networkidle2', timeout: TIMEOUT });
            await autoScroll(page);

            const items = await page.evaluate((site) => {
                const found = [];
                document.querySelectorAll('.lote-item').forEach(el => {
                    try {
                        const linkEl = el.querySelector('a.img-destaque');
                        const titulo = el.querySelector('.info h3')?.innerText.trim();
                        if (!linkEl || !titulo) return;

                        const imgEl = linkEl.querySelector('img');
                        const loteNum = el.querySelector('.lote-num strong')?.innerText.trim() || '';
                        const lance = el.querySelector('.lance-atual span')?.innerText.trim() || el.querySelector('.lance-atual')?.innerText.trim();
                        const details = Array.from(el.querySelectorAll('.info p')).map(p => p.innerText).join(' ');

                        // Condition pattern detection
                        const text = (titulo + ' ' + details).toUpperCase();
                        let cond = 'Venda Direta';
                        if (text.includes('SUCATA')) cond = 'Sucata';
                        else if (text.includes('SINISTRO') || text.includes('COLISÃO') || text.includes('BATIDO')) cond = 'Sinistrado';
                        else if (text.includes('FINANCEIRA') || text.includes('RECUPERADO')) cond = 'Recuperado de Financiamento';
                        else if (text.includes('DOCUMENTÁVEL')) cond = 'Documentável';

                        // Basic garbage filter
                        const blacklist = ['MOVEIS', 'ELETRO', 'INFORMÁTICA', 'PEÇAS', 'DIVERSOS', 'TELEVISAO', 'CELULAR'];
                        if (blacklist.some(b => text.includes(b)) && !text.includes('SINISTRO')) return;

                        found.push({
                            site: site,
                            registro: loteNum || linkEl.href.split('/').pop(),
                            link: linkEl.href,
                            veiculo: titulo,
                            fotos: imgEl && imgEl.src && !imgEl.src.includes('sem_foto') ? [imgEl.src] : [],
                            valor: parseFloat(lance?.replace(/[^0-9,]/g, '').replace(',', '.')) || 0,
                            descricao: details,
                            localLeilao: 'RJ / MG / SP',
                            condicao: cond,
                            modalidade: 'leilao'
                        });
                    } catch (err) { }
                });
                return found;
            }, SITE);

            auctionVehicles.push(...items);
        } catch (e) {
            console.log(`   ⚠️ [${idFromUrl(url)}] Erro: ${e.message}`);
        } finally {
            await page.close();
        }
        return auctionVehicles;
    };

    const idFromUrl = (url) => url.split('/').pop();

    const buscarTodos = async () => {
        console.log(`🚀 [${SITE}] High-Yield Mode: Inicializando...`);
        const browser = await puppeteer.launch({
            headless: "new",
            args: ['--no-sandbox', '--disable-setuid-sandbox', '--window-size=1920,1080']
        });

        let total = 0;
        try {
            const page = await browser.newPage();
            console.log(`🔍 [${SITE}] Mapeando leilões na home...`);
            await page.goto(BASE, { waitUntil: 'networkidle2', timeout: TIMEOUT });

            const auctionLinks = await page.evaluate(() => {
                const links = new Set();
                document.querySelectorAll('a[href*="/leilao/"]').forEach(a => {
                    const h = a.getAttribute('href');
                    if (h && !h.includes('/lista') && h.split('/').pop().length > 2) links.add(h);
                });
                return [...links];
            });

            console.log(`✅ [${SITE}] ${auctionLinks.length} leilões encontrados. Processando em paralelo...`);

            for (let i = 0; i < auctionLinks.length; i += CONCURRENCY) {
                const chunk = auctionLinks.slice(i, i + CONCURRENCY);
                const results = await Promise.all(chunk.map(link => crawlAuction(browser, link)));
                const flattened = results.flat();

                if (flattened.length > 0) {
                    await salvarLista(flattened);
                    total += flattened.length;
                }
                console.log(`   🔸 [Pool] Bloco ${i + 1}-${i + chunk.length} concluído. Total: ${total}`);
            }

        } catch (e) {
            console.error(`❌ [${SITE}] Erro Fatal: ${e.message}`);
        } finally {
            await browser.close();
        }
        return total;
    };

    return { buscarTodos, SITE };
};

async function autoScroll(page) {
    await page.evaluate(async () => {
        await new Promise((resolve) => {
            let totalHeight = 0;
            let distance = 300;
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
