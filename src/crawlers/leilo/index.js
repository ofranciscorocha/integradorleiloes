import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import dotenv from 'dotenv';

dotenv.config();
puppeteer.use(StealthPlugin());

const TIMEOUT = parseInt(process.env.CRAWLER_TIMEOUT_MS) || 90000; // Increased to 1.5m
const CONCURRENCY = 1; // Sequential to reduce memory usage on Railway

const createCrawler = (db) => {
    const { salvarLista } = db;
    const SITE = 'leilo.com.br';
    const BASE_URL = 'https://www.leilo.com.br';

    // Vehicle-only category URLs (NOT generic /leilao which includes imóveis and equipamentos)
    const VEHICLE_CATEGORIES = [
        `${BASE_URL}/leilao/carros`,
        `${BASE_URL}/leilao/moto`,
        `${BASE_URL}/leilao/pesados`,
    ];

    // Block unnecessary resources to speed up page loads
    const setupResourceBlocking = async (page) => {
        await page.setRequestInterception(true);
        page.on('request', (req) => {
            const type = req.resourceType();
            if (['image', 'stylesheet', 'font', 'media'].includes(type)) {
                req.abort();
            } else {
                req.continue();
            }
        });
    };

    const crawlAuction = async (browser, link) => {
        console.log(`📋 [${SITE}] Capturando leilão: ${link}`);
        const page = await browser.newPage();
        await setupResourceBlocking(page);
        const results = [];
        try {
            await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36');

            let currentUrl = link;
            let pageNum = 1;
            while (currentUrl && pageNum <= 20) {
                await page.goto(currentUrl, { waitUntil: 'domcontentloaded', timeout: TIMEOUT });
                await page.waitForSelector('a[href*="/item/"]', { timeout: 10000 }).catch(() => null);
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

                        // Extract image - handle lazy loading
                        let imgSrc = '';
                        if (imgEl) {
                            imgSrc = imgEl.getAttribute('src') || imgEl.getAttribute('data-src') ||
                                imgEl.getAttribute('data-lazy') || imgEl.getAttribute('data-original') || '';
                            if (imgSrc.includes('data:image') || imgSrc.includes('placeholder')) imgSrc = '';
                        }

                        // Try to extract year from title
                        const yearMatch = title.match(/\b(19[89]\d|20[0-2]\d)\b/);

                        found.push({
                            registro,
                            site: site,
                            veiculo: title.toUpperCase(),
                            link: url,
                            fotos: imgSrc ? [imgSrc] : [],
                            valor: priceEl ? parseFloat(priceEl.innerText.replace(/[^0-9,]/g, '').replace(',', '.')) || 0 : 0,
                            localLeilao: 'Brasil',
                            ano: yearMatch ? parseInt(yearMatch[1]) : null,
                            modalidade: 'leilao',
                            tipo: 'veiculo'
                        });
                    });
                    return found;
                }, SITE);

                if (itens.length > 0) {
                    const filtered = filterVehicles(itens);
                    results.push(...filtered);
                    console.log(`   ✅ [${SITE}] Página ${pageNum}: ${itens.length} detectados, ${filtered.length} veículos válidos.`);
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
        console.log(`🚀 [${SITE}] Iniciando captura - APENAS VEÍCULOS...`);

        const browser = await puppeteer.launch({
            headless: "new",
            protocolTimeout: 120000,
            args: [
                '--no-sandbox', '--disable-setuid-sandbox',
                '--disable-dev-shm-usage', '--disable-gpu',
                '--disable-extensions', '--disable-background-networking',
                '--window-size=1280,720'
            ]
        });

        const listaTotal = [];
        const seenIds = new Set();
        try {
            const page = await browser.newPage();
            await setupResourceBlocking(page);

            // STAGE 1: Discover vehicle auctions ONLY from vehicle category pages
            console.log(`🔍 [${SITE}] Mapeando leilões de VEÍCULOS...`);
            const auctionLinks = new Set();

            for (const catUrl of VEHICLE_CATEGORIES) {
                try {
                    console.log(`   🧭 [${SITE}] Categoria: ${catUrl}`);
                    try {
                        await page.goto(catUrl, { waitUntil: 'domcontentloaded', timeout: TIMEOUT });
                    } catch (err) {
                        console.log(`   ⚠️ [${SITE}] Timeout inicial em ${catUrl}, tentando reload...`);
                        await page.reload({ waitUntil: 'domcontentloaded', timeout: TIMEOUT });
                    }
                    await autoScroll(page);

                    const found = await page.evaluate(() => {
                        const links = [];
                        document.querySelectorAll('a[href*="/leilao/"]').forEach(a => {
                            const href = a.href;
                            // Accept auction detail links, skip category/nav links
                            if (href.includes('/item/') || href.includes('/agenda') || href.includes('/realizados')) return;
                            if (href.match(/\/leilao\/\d+/) || href.match(/\/leilao\/[a-z]+-\d+/)) {
                                links.push(href);
                            }
                        });
                        return links;
                    });
                    found.forEach(l => auctionLinks.add(l));
                    console.log(`   📊 [${SITE}] ${found.length} links nesta categoria`);
                } catch (e) {
                    console.log(`   ⚠️ [${SITE}] Erro em ${catUrl}: ${e.message}`);
                }
            }

            // Also try the /veiculos page as additional source
            try {
                await page.goto(`${BASE_URL}/veiculos`, { waitUntil: 'networkidle2', timeout: TIMEOUT });
                const extraLinks = await page.evaluate(() => {
                    const links = [];
                    document.querySelectorAll('a[href*="/leilao/"]').forEach(a => {
                        if (!a.href.includes('/agenda') && !a.href.includes('/realizados') && !a.href.includes('/item/')) {
                            links.push(a.href);
                        }
                    });
                    return links;
                });
                extraLinks.forEach(l => auctionLinks.add(l));
            } catch (e) { }

            const linksArray = [...auctionLinks];
            console.log(`✅ [${SITE}] ${linksArray.length} leilões de veículos encontrados. Processando...`);

            await page.close();

            // STAGE 2: Crawl each auction
            for (let i = 0; i < linksArray.length; i += CONCURRENCY) {
                const chunk = linksArray.slice(i, i + CONCURRENCY);
                const results = await Promise.all(chunk.map(link => crawlAuction(browser, link)));
                const flattened = results.flat().filter(v => {
                    if (seenIds.has(v.registro)) return false;
                    seenIds.add(v.registro);
                    return true;
                });

                if (flattened.length > 0) {
                    await salvarLista(flattened);
                    listaTotal.push(...flattened);
                }
                console.log(`   🔸 [${SITE}] Lote ${Math.floor(i / CONCURRENCY) + 1}/${Math.ceil(linksArray.length / CONCURRENCY)}. Total: ${listaTotal.length} veículos.`);
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

/**
 * Filter to only real vehicles - following Sodré Santoro reference pattern
 */
function filterVehicles(items) {
    return items.filter(v => {
        const text = v.veiculo.toUpperCase();

        const blacklist = [
            'MOVEIS', 'ELETRO', 'INFORMÁTICA', 'SUCATA DE FERRO', 'TELEVISAO', 'CELULAR',
            'CADEIRA', 'MESA', 'ARMARIO', 'GELADEIRA', 'FOGAO', 'MACBOOK', 'IPHONE', 'NOTEBOOK',
            'MONITOR', 'BEBEDOURO', 'SOFA', 'ROUPAS', 'CALCADOS', 'BOLSAS', 'BRINQUEDOS',
            'IMOVEL', 'IMOVEIS', 'CASA', 'APARTAMENTO', 'TERRENO', 'SITIO', 'FAZENDA', 'GALPAO',
            'MATERIAL', 'FERRAGENS', 'SUCATA DE BENS', 'ESCRITORIO', 'EQUIPAMENTO', 'PEÇAS',
            'LOTE DE', 'MADEIRA', 'QUADRO', 'ESTANTE'
        ];

        const brands = [
            'HONDA', 'TOYOTA', 'FIAT', 'VOLKSWAGEN', 'VW', 'CHEVROLET', 'GM', 'FORD', 'YAMAHA',
            'KAWASAKI', 'SUZUKI', 'HYUNDAI', 'RENAULT', 'JEEP', 'BMW', 'MERCEDES', 'NISSAN',
            'MITSUBISHI', 'KIA', 'PEUGEOT', 'CITROEN', 'AUDI', 'VOLVO', 'PORSCHE', 'CHERY',
            'IVECO', 'SCANIA', 'MAN', 'DAF', 'HARLEY', 'DUCATI', 'TRIUMPH', 'CAOA', 'BYD',
            'GWM', 'JAC', 'LIFAN', 'LAND ROVER', 'RANGE ROVER', 'DAFRA', 'SHINERAY', 'HAOJUE'
        ];

        const isBlacklisted = blacklist.some(b => text.includes(b));
        const hasBrand = brands.some(b => text.includes(b));

        // If blacklisted and no vehicle brand → reject
        if (isBlacklisted && !hasBrand) return false;

        return true;
    });
}

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
