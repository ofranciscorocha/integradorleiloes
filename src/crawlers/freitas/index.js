import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import dotenv from 'dotenv';
import connectDatabase from '../../database/db.js';

dotenv.config();
puppeteer.use(StealthPlugin());

let db;

const run = async () => {
    try {
        const connection = await connectDatabase();
        console.log('--- Iniciando Crawler Freitas Leiloeiro (Puppeteer) ---');
        await execute(connection);
        console.log('--- Finalizado Freitas ---');
        process.exit(0);
    } catch (error) {
        console.error('Erro fatal:', error);
        process.exit(1);
    }
};

const execute = async (database) => {
    db = database;
    const SITE = 'freitasleiloeiro.com.br';
    const baseUrl = 'https://www.freitasleiloeiro.com.br';

    const browser = await puppeteer.launch({
        headless: "new",
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    let totalGeral = 0;
    try {
        const page = await browser.newPage();
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36');

        for (let p = 1; p <= 10; p++) {
            console.log(`🔍 [${SITE}] Buscando página ${p}...`);
            const url = `${baseUrl}/Leiloes/PesquisarLotes?Categoria=1&PageNumber=${p}`;

            await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });
            await page.waitForSelector('.cardlote', { timeout: 20000 }).catch(() => null);

            const itens = await page.evaluate((base, site) => {
                const results = [];
                const cards = document.querySelectorAll('.cardlote');

                cards.forEach(card => {
                    const linkEl = card.querySelector('a');
                    const titleEl = card.querySelector('.cardLote-descVeic');
                    const imgEl = card.querySelector('.cardLote-img');
                    const priceEl = card.querySelector('.cardLote-vlr');

                    if (!linkEl || !titleEl) return;

                    const title = titleEl.innerText.trim();
                    const link = linkEl.href;
                    const registro = card.querySelector('.cardLote-lote')?.innerText.replace('Lote:', '').trim() || link.split('=').pop();

                    results.push({
                        registro,
                        site: site,
                        veiculo: title.toUpperCase(),
                        link: link,
                        fotos: imgEl && imgEl.src ? [imgEl.src] : [],
                        valor: priceEl ? parseFloat(priceEl.innerText.replace(/[^0-9,]/g, '').replace(',', '.')) || 0 : 0,
                        localLeilao: 'SP',
                        modalidade: 'leilao'
                    });
                });
                return results;
            }, baseUrl, SITE);

            if (itens.length === 0) break;

            await db.salvarLista(itens);
            totalGeral += itens.length;
            console.log(`   Saved ${itens.length} lots.`);

            const hasNext = await page.evaluate(() => {
                const nav = document.querySelector('.pagination');
                return nav && !nav.innerText.includes('Próximo') ? false : true; // Simplified check
            });
            if (!hasNext) break;
        }

    } catch (error) {
        console.error(`❌ [${SITE}] Erro:`, error.message);
    } finally {
        await browser.close();
    }
    return totalGeral;
};

if (process.argv[1].includes('freitas')) {
    run();
}

export default { run, execute };
