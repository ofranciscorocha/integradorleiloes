import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import dotenv from 'dotenv';

dotenv.config();
puppeteer.use(StealthPlugin());

const TIMEOUT = parseInt(process.env.CRAWLER_TIMEOUT_MS) || 60000;

const createCrawler = (db) => {
    const { salvarLista } = db;
    const SITE = 'mgl.com.br';
    const BASE_URL = 'https://www.mgl.com.br';

    const buscarTodos = async () => {
        console.log(`🚀 [${SITE}] HIGH-YIELD: Iniciando captura...`);

        const browser = await puppeteer.launch({
            headless: "new",
            args: ['--no-sandbox', '--disable-setuid-sandbox', '--window-size=1920,1080']
        });

        const listaTotal = [];
        try {
            const page = await browser.newPage();
            await page.setViewport({ width: 1920, height: 1080 });
            await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36');

            console.log(`   🔍 [${SITE}] Navegando para leilões...`);
            await page.goto(`${BASE_URL}/leiloes`, { waitUntil: 'networkidle2', timeout: TIMEOUT });

            // Wait for cards
            await page.waitForSelector('.dg-leilao-item-card, .card, a[href*="/leilao/"]', { timeout: 30000 }).catch(() => null);

            // Scroll to load all
            console.log(`   🔸 [${SITE}] Ativando Deep-Scroll...`);
            await autoScroll(page);

            const items = await page.evaluate((site) => {
                const results = [];
                // MGL uses specific classes for lot cards in some views, or generic cards
                const cards = document.querySelectorAll('.dg-leilao-item-card, .card, .lote-item');
                console.log(`Debug [${site}]: cards found = ${cards.length}`);

                cards.forEach((card, idx) => {
                    try {
                        const linkEl = card.querySelector('a[href*="/leilao/"], a[href*="/lote/"], a[href*="/item/"]');
                        const titleEl = card.querySelector('.dg-leilao-item-titulo, .titulo, h3, h5, .card-title');
                        const imgEl = card.querySelector('img');
                        const valorEl = card.querySelector('.dg-leilao-item-valor, .valor, .lance-atual, .price');

                        if (!linkEl || !titleEl) return;

                        const title = titleEl.innerText.trim().toUpperCase();
                        const link = linkEl.href;
                        const foto = imgEl ? (imgEl.getAttribute('data-src') || imgEl.src) : '';
                        const valorRaw = valorEl ? valorEl.innerText : '0';
                        const valor = parseFloat(valorRaw.replace(/[^0-9,]/g, '').replace(',', '.')) || 0;

                        // Filter for vehicles
                        const blacklist = ['MOVEIS', 'IMOVEL', 'TERRENO', 'APARTAMENTO', 'CASA'];
                        if (blacklist.some(b => title.includes(b))) return;

                        results.push({
                            registro: link.split('/').pop().split('?')[0],
                            site: site,
                            veiculo: title,
                            link: link,
                            fotos: foto ? [foto] : [],
                            valor: valor,
                            localLeilao: 'MG / BR',
                            modalidade: 'leilao',
                            tipo: 'veiculo'
                        });
                    } catch (e) { }
                });
                return results;
            }, SITE);

            if (items.length > 0) {
                await salvarLista(items);
                listaTotal.push(...items);
                console.log(`✅ [${SITE}] Sucesso! ${items.length} veículos coletados.`);
            }

        } catch (error) {
            console.error(`❌ [${SITE}] Erro:`, error.message);
        } finally {
            await browser.close();
        }
        return listaTotal.length;
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
                if (totalHeight >= scrollHeight || totalHeight > 10000) {
                    clearInterval(timer);
                    resolve();
                }
            }, 100);
        });
    });
}

export default createCrawler;
