import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import dotenv from 'dotenv';

dotenv.config();
puppeteer.use(StealthPlugin());

const TIMEOUT = parseInt(process.env.CRAWLER_TIMEOUT_MS) || 45000;

const createCrawler = (db) => {
    const { salvarLista } = db;
    const SITE = 'parquedosleiloes.com.br';
    const BASE_URL = 'https://www.parquedosleiloes.com.br';

    const buscarTodasPaginas = async (maxPaginas = 10) => {
        console.log(`🚀 [${SITE}] Iniciando crawler (Puppeteer Mode)...`);

        const browser = await puppeteer.launch({
            headless: "new",
            args: ['--no-sandbox', '--disable-setuid-sandbox']
        });

        let totalGeral = 0;
        try {
            const page = await browser.newPage();
            await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36');

            for (let p = 1; p <= maxPaginas; p++) {
                console.log(`🔍 [${SITE}] Buscando página ${p}...`);
                const url = `${BASE_URL}/leiloes?is_lot=1&searchMode=normal&page=${p}`;

                await page.goto(url, { waitUntil: 'networkidle2', timeout: TIMEOUT });

                await page.waitForSelector('.auction-lot-card', { timeout: 10000 }).catch(() => null);

                const itens = await page.evaluate((site) => {
                    const results = [];
                    const cards = document.querySelectorAll('.auction-lot-card');

                    cards.forEach(card => {
                        const linkEl = card.querySelector('.thumbnail a');
                        const infoDiv = card.querySelector('.info');
                        const h3El = card.querySelector('.name');
                        const imgEl = card.querySelector('img');

                        if (!linkEl || !h3El) return;

                        const title = h3El.innerText.trim();
                        const link = linkEl.href;
                        const registro = link.split('/').pop();
                        const details = card.querySelector('.comments-text')?.innerText.trim() || '';

                        results.push({
                            registro,
                            site: site,
                            veiculo: title.toUpperCase(),
                            link: link,
                            fotos: imgEl && imgEl.src ? [imgEl.src] : [],
                            descricao: details,
                            localLeilao: 'DF',
                            modalidade: 'leilao'
                        });
                    });
                    return results;
                }, SITE);

                if (itens.length === 0) {
                    console.log(`   No more lots found.`);
                    break;
                }

                await salvarLista(itens);
                totalGeral += itens.length;
                console.log(`   Saved ${itens.length} lots.`);

                // Check if next page exists
                const hasNext = await page.evaluate(() => !!document.querySelector('li.next:not(.disabled)'));
                if (!hasNext) break;
            }

        } catch (error) {
            console.error(`❌ [${SITE}] Erro:`, error.message);
        } finally {
            await browser.close();
        }
        return totalGeral;
    };

    return { buscarTodasPaginas, SITE };
};

export default createCrawler;
