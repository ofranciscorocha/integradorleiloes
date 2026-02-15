import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import dotenv from 'dotenv';
import connectDatabase from '../../database/db.js';

dotenv.config();
puppeteer.use(StealthPlugin());

let db;

export const execute = async (database) => {
    db = database;
    const SITE = 'patiorochaleiloes.com.br';
    console.log(`--- Iniciando Crawler ${SITE} ---`);

    const browser = await puppeteer.launch({
        headless: "new",
        protocolTimeout: 120000,
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--window-size=1920,1080',
            '--disable-dev-shm-usage',
            '--disable-accelerated-2d-canvas',
            '--disable-gpu',
            '--no-first-run'
        ]
    });

    let capturados = 0;

    try {
        const page = await browser.newPage();
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36');

        // Navigation timeout to 90s for slower sites
        await page.goto('https://www.patiorochaleiloes.com.br/lotes/search?tipo=veiculo', {
            waitUntil: 'networkidle2',
            timeout: 90000
        });

        // Deep Scroll to trigger infinite loading
        console.log(`🔍 [${SITE}] Ativando Deep-Scroll...`);
        await autoScroll(page);

        const items = await page.evaluate((site) => {
            const results = [];
            const cards = document.querySelectorAll('.card');

            cards.forEach((card, idx) => {
                try {
                    const linkEl = card.querySelector('a');
                    const titleEl = card.querySelector('h5, .card-title, h3');

                    if (!linkEl || !titleEl) return;

                    // Improved Photo Extraction
                    const imgEl = card.querySelector('a.rounded, .img-wrapper, img');
                    let foto = '';
                    if (imgEl) {
                        if (imgEl.tagName === 'IMG') {
                            foto = imgEl.src || imgEl.getAttribute('data-src');
                        } else {
                            const style = imgEl.getAttribute('style') || '';
                            const match = style.match(/url\(['"]?(.*?)['"]?\)/);
                            if (match) foto = match[1];
                        }
                    }

                    // Condition Parsing
                    const textContent = card.innerText.toUpperCase();
                    let condicao = 'Leilão';
                    if (textContent.includes('SUCATA')) condicao = 'Sucata';
                    else if (textContent.includes('SINISTRO')) condicao = 'Sinistrado';
                    else if (textContent.includes('CONSERVADO')) condicao = 'Conservado';
                    else if (textContent.includes('RECUPERADO')) condicao = 'Recuperado';

                    // Year
                    const anoMatch = textContent.match(/ANO\/MODELO:\s*(\d{4})/);
                    const ano = anoMatch ? parseInt(anoMatch[1]) : null;

                    // Value
                    const valueEl = card.querySelector('h4, .price, .valor');
                    const valorText = valueEl ? valueEl.innerText.trim() : '0';
                    const valor = parseFloat(valorText.replace(/[^0-9,]/g, '').replace(',', '.')) || 0;

                    const link = linkEl.href;
                    const titulo = titleEl.innerText.trim();

                    results.push({
                        registro: link.split('/').pop().split('?')[0],
                        site: site,
                        link: link,
                        veiculo: titulo.toUpperCase(),
                        fotos: foto ? [foto] : [],
                        valor: valor,
                        condicao: condicao,
                        ano: ano,
                        localLeilao: 'PR / BR',
                        modalidade: 'leilao'
                    });
                } catch (e) { }
            });
            return results;
        }, SITE);

        if (items.length > 0) {
            await db.salvarLista(items);
            capturados = items.length;
            console.log(`✅ [${SITE}] Capturados ${capturados} veículos.`);
        }

    } catch (e) {
        console.error(`❌ [${SITE}] Erro:`, e.message);
    } finally {
        await browser.close();
    }
};

async function autoScroll(page) {
    await page.evaluate(async () => {
        await new Promise((resolve) => {
            let totalHeight = 0;
            let distance = 300;
            let count = 0;
            let timer = setInterval(() => {
                let scrollHeight = document.body.scrollHeight;
                window.scrollBy(0, distance);
                totalHeight += distance;
                count++;
                if (totalHeight >= scrollHeight || count > 100) {
                    clearInterval(timer);
                    resolve();
                }
            }, 100);
        });
    });
    await new Promise(r => setTimeout(r, 2000));
}

export default { execute };
