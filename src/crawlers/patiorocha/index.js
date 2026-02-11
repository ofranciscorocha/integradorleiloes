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
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--window-size=1920,1080',
            '--disable-dev-shm-usage',
            '--disable-accelerated-2d-canvas',
            '--disable-gpu',
            '--no-first-run',
            '--no-zygote',
            '--single-process'
        ]
    });

    let capturados = 0;

    try {
        const page = await browser.newPage();

        // Navigation timeout to 60s
        await page.goto('https://www.patiorochaleiloes.com.br/lotes/search?tipo=veiculo', {
            waitUntil: 'networkidle2',
            timeout: 60000
        });

        // Basic AutoScroll to load content
        await autoScroll(page);

        const items = await page.evaluate(() => {
            const results = [];
            const cards = document.querySelectorAll('.card');

            cards.forEach((card, idx) => {
                try {
                    const linkEl = card.querySelector('a');
                    const titleEl = card.querySelector('h5');

                    // Image is usually a background-image on an <a> with class 'rounded'
                    const imgEl = card.querySelector('a.rounded');
                    let foto = '';
                    if (imgEl) {
                        const style = imgEl.getAttribute('style') || '';
                        const match = style.match(/url\(['"]?(.*?)['"]?\)/);
                        if (match) foto = match[1];
                    }

                    // If not found, fallback to img tag (comitente logo or fallback)
                    if (!foto) {
                        const imgTag = card.querySelector('img');
                        if (imgTag) foto = imgTag.src;
                    }

                    // Condition
                    const condTags = Array.from(card.querySelectorAll('b'));
                    let condicao = 'Geral';
                    const possibleConds = ['Sucata', 'Sinistro', 'Financiamento', 'Recuperado', 'Trânsito', 'Conservado'];
                    for (const tag of condTags) {
                        const text = tag.innerText.trim();
                        if (possibleConds.some(c => text.includes(c))) {
                            condicao = text;
                            break;
                        }
                    }

                    // Location
                    const divs = Array.from(card.querySelectorAll('div'));
                    let localText = 'Consultar Site';
                    const localDiv = divs.find(d => d.innerText.includes('Local de Exposição:'));
                    if (localDiv) {
                        localText = localDiv.innerText.replace('Local de Exposição:', '').trim();
                    }

                    // Value
                    const valueEl = card.querySelector('h4');
                    const valorText = valueEl ? valueEl.innerText.trim() : '0';
                    const valor = parseFloat(valorText.replace(/[^0-9,]/g, '').replace(',', '.')) || 0;

                    // Year (Ano/Modelo: 2005/2005)
                    const contentText = card.innerText;
                    const anoMatch = contentText.match(/Ano\/Modelo:\s*(\d{4})/);
                    const ano = anoMatch ? parseInt(anoMatch[1]) : null;

                    if (linkEl && titleEl) {
                        const link = linkEl.href;
                        const titulo = titleEl.innerText.trim();

                        results.push({
                            index: idx,
                            registro: link.split('/').pop().split('?')[0],
                            site: 'patiorochaleiloes.com.br',
                            link: link,
                            veiculo: titulo,
                            fotos: foto ? [foto] : [],
                            valor: valor,
                            condicao: condicao,
                            ano: ano,
                            localLeilao: localText,
                            modalidade: 'leilao',
                            previsao: { string: 'Consultar Site' }
                        });
                    }
                } catch (e) {
                    console.log('Error parsing card:', idx, e.message);
                }
            });
            return results;
        });

        console.log(`Debug [${SITE}]: found ${items.length} initial items`);
        const validItems = items.filter(v => v.fotos.length > 0);
        console.log(`Debug [${SITE}]: found ${validItems.length} items with photos`);

        if (validItems.length > 0) {
            await db.salvarLista(validItems);
            capturados = validItems.length;
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
            var totalHeight = 0;
            var distance = 200;
            var timer = setInterval(() => {
                var scrollHeight = document.body.scrollHeight;
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

if (process.argv[1].includes('patiorocha')) {
    (async () => {
        const db = await connectDatabase();
        await execute(db);
        process.exit(0);
    })();
}

export default { execute };
