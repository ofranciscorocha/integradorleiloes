import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import dotenv from 'dotenv';
import connectDatabase from '../../database/db.js';

dotenv.config();

puppeteer.use(StealthPlugin());

const TIMEOUT = parseInt(process.env.CRAWLER_TIMEOUT_MS) || 45000;
const DELAY = parseInt(process.env.CRAWLER_DELAY_MS) || 2000;

const createCrawler = (db) => {
    const { salvarLista } = db;
    const SITE = 'rogeriomenezes.com.br';
    const BASE = 'https://www.rogeriomenezes.com.br';

    const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

    const buscarTodos = async () => {
        console.log(`\n🚀 [${SITE}] Iniciando crawler (Puppeteer Full Scraping)...`);

        const browser = await puppeteer.launch({
            headless: "new",
            args: ['--no-sandbox', '--disable-setuid-sandbox', '--window-size=1920,1080']
        });

        let totalCapturado = 0;

        try {
            const page = await browser.newPage();

            // 1. Get Auction Links
            console.log(`🔍 [${SITE}] Visitando home...`);
            await page.goto(BASE, { waitUntil: 'networkidle2', timeout: 60000 });

            const auctionLinks = await page.evaluate(() => {
                const links = [];
                document.querySelectorAll('a[href*="/leilao/"]').forEach(a => {
                    const href = a.getAttribute('href');
                    const text = a.innerText;
                    if ((text.includes('VEÍCULO') || text.includes('Seguradora') || text.includes('Bancos') || text.includes('Financeira')) && !links.includes(href)) {
                        links.push(href);
                    }
                });
                return links;
            });

            const uniqueAuctionLinks = [...new Set(auctionLinks)];
            console.log(`✅ [${SITE}] ${uniqueAuctionLinks.length} leilões encontrados`);

            // 2. Process Each Auction
            for (const auctionLink of uniqueAuctionLinks) {
                const url = auctionLink.startsWith('http') ? auctionLink : `${BASE}${auctionLink}`;
                console.log(`\n📋 [${SITE}] Processando leilão: ${url}`);

                try {
                    await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });
                    await autoScroll(page);
                    await sleep(1000);

                    // 2a. Get Lot Links & Basic Info
                    const preLotes = await page.evaluate((site) => {
                        const items = [];
                        document.querySelectorAll('.lote-item').forEach(el => {
                            try {
                                const linkEl = el.querySelector('a.img-destaque');
                                if (!linkEl) return;

                                const href = linkEl.href;
                                const imgEl = linkEl.querySelector('img');
                                const loteNum = el.querySelector('.lote-num strong')?.innerText.trim() || '';
                                const titulo = el.querySelector('.info h3')?.innerText.trim();
                                const lance = el.querySelector('.lance-atual')?.innerText.trim();
                                const details = Array.from(el.querySelectorAll('.info p')).map(p => p.innerText).join(' ');

                                // Filter garbage
                                const isDateTitle = titulo && (titulo.match(/^\d{2}\/\d{2}/) || titulo.includes('Daqui a') || titulo.includes('Lance'));
                                const hasPhoto = imgEl && imgEl.src && !imgEl.src.includes('sem_foto') && !imgEl.src.includes('placehold');

                                if (titulo && !isDateTitle && hasPhoto) {
                                    items.push({
                                        site: site,
                                        registro: loteNum || href.split('/').pop(),
                                        link: href,
                                        veiculo: titulo,
                                        fotos: imgEl ? [imgEl.src] : [],
                                        valor: lance ? parseFloat(lance.replace(/[^0-9,]/g, '').replace(',', '.')) : 0,
                                        descricao: details,
                                        localLeilao: 'Rio de Janeiro - RJ',
                                        modalidade: 'leilao'
                                    });
                                }
                            } catch (err) { }
                        });
                        return items;
                    }, SITE);

                    console.log(`   found ${preLotes.length} valid lots in listing.`);

                    // 3. Visit Lots for Condition
                    const lotesFinais = [];
                    for (const lote of preLotes) {
                        try {
                            await page.goto(lote.link, { waitUntil: 'domcontentloaded', timeout: 30000 });

                            const details = await page.evaluate(() => {
                                const body = document.body.innerText;
                                let condicao = 'Desconhecida';
                                if (body.match(/sucata/i)) condicao = 'Sucata';
                                else if (body.match(/sinistrado|colisão|batido/i)) condicao = 'Colisão/Sinistrado';
                                else if (body.match(/recuperado|financeira/i)) condicao = 'Recuperado de Financiamento';
                                else if (body.match(/documento|documentavel/i)) condicao = 'Documentável';

                                const tds = Array.from(document.querySelectorAll('td'));
                                const condTd = tds.find(td => td.innerText.includes('Condição') || td.innerText.includes('Tipo de Monta'));
                                if (condTd && condTd.nextElementSibling) {
                                    condicao = condTd.nextElementSibling.innerText.trim();
                                }
                                return { condicao };
                            });

                            lote.condicao = details.condicao;
                            lote.descricao = `[${details.condicao}] ${lote.descricao}`;
                            lotesFinais.push(lote);
                        } catch (e) {
                            lotesFinais.push(lote);
                        }
                    }

                    // Strict Filter: No Photos or Bad Titles = Skip
                    const validLotes = lotesFinais.filter(l => {
                        if (!l.fotos || l.fotos.length === 0) return false;
                        if (l.veiculo && l.veiculo.match(/^\d{2}\/\d{2}/)) return false; // Date titles
                        return true;
                    });

                    if (validLotes.length > 0) {
                        await salvarLista(validLotes);
                        totalCapturado += validLotes.length;
                        console.log(`   ✅ Saved ${validLotes.length} vehicles (Filtered from ${lotesFinais.length}).`);
                    }

                } catch (e) {
                    console.log(`   Error in auction loop: ${e.message}`);
                }
            }

        } catch (e) {
            console.error(`❌ Fatal Error: ${e.message}`);
        } finally {
            await browser.close();
        }
        return totalCapturado;
    };

    return {
        buscarTodos,
        SITE
    };
};

async function autoScroll(page) {
    await page.evaluate(async () => {
        await new Promise((resolve) => {
            var totalHeight = 0;
            var distance = 100;
            var retries = 0;
            var maxRetries = 20;

            var timer = setInterval(() => {
                var scrollHeight = document.body.scrollHeight;
                window.scrollBy(0, distance);
                totalHeight += distance;

                if ((window.innerHeight + window.scrollY) >= scrollHeight - 100) {
                    retries++;
                    if (retries >= maxRetries) {
                        clearInterval(timer);
                        resolve();
                    }
                } else {
                    retries = 0;
                }
            }, 100);
        });
    });
}

export default createCrawler;

// Standalone runner
if (process.argv[1].includes('rogeriomenezes')) {
    (async () => {
        const connectDatabase = (await import('../../database/db.js')).default;
        const db = await connectDatabase();
        const crawler = createCrawler(db);
        await crawler.buscarTodos();
        process.exit(0);
    })();
}
