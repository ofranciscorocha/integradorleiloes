import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import dotenv from 'dotenv';
import { getExecutablePath, getCommonArgs, getRandomUserAgent } from '../../utils/browser.js';

dotenv.config();
puppeteer.use(StealthPlugin());
import { standardizeStatus } from '../../utils/status.js';
import { classifyVehicle } from '../../utils/vehicle-parser.js';

const TIMEOUT = parseInt(process.env.CRAWLER_TIMEOUT_MS) || 90000;

const createCrawler = (db) => {
    const { salvarLista } = db;
    const SITE = 'mgl.com.br';
    const BASE_URL = 'https://www.mgl.com.br';

    const BLACKLIST = [
        'MOVEIS', 'ELETRO', 'INFORMÁTICA', 'SUCATA DE FERRO', 'TELEVISAO', 'CELULAR',
        'CADEIRA', 'MESA', 'ARMARIO', 'GELADEIRA', 'FOGAO', 'MACBOOK', 'IPHONE', 'NOTEBOOK',
        'MONITOR', 'BEBEDOURO', 'SOFA', 'ROUPAS', 'CALCADOS', 'BOLSAS',
        'IMOVEL', 'IMOVEIS', 'CASA', 'APARTAMENTO', 'APTO', 'TERRENO', 'SITIO', 'FAZENDA', 'GALPAO',
        'MATERIAL', 'FERRAGENS', 'SUCATA DE BENS', 'ESCRITORIO', 'LOTE DE', 'MADEIRA', 'VAGA', 'GARAGEM'
    ];

    const BRANDS = [
        'HONDA', 'TOYOTA', 'FIAT', 'VOLKSWAGEN', 'VW', 'CHEVROLET', 'GM', 'FORD', 'YAMAHA',
        'KAWASAKI', 'SUZUKI', 'HYUNDAI', 'RENAULT', 'JEEP', 'BMW', 'MERCEDES', 'NISSAN',
        'MITSUBISHI', 'KIA', 'PEUGEOT', 'CITROEN', 'AUDI', 'VOLVO', 'PORSCHE', 'CHERY',
        'IVECO', 'SCANIA', 'MAN', 'DAF', 'HARLEY', 'DUCATI', 'TRIUMPH', 'CAOA', 'BYD',
        'GWM', 'JAC', 'LIFAN', 'LAND ROVER', 'DAFRA', 'SHINERAY', 'HAOJUE'
    ];

    const buscarTodos = async () => {
        console.log(`🚀 [${SITE}] SUPERCRAWLER: Iniciando captura...`);

        const browser = await puppeteer.launch({
            executablePath: getExecutablePath(),
            headless: true,
            protocolTimeout: 300000,
            args: getCommonArgs()
        });

        let totalCapturados = 0;
        const seenIds = new Set();

        try {
            const page = await browser.newPage();
            await page.setViewport({ width: 1920, height: 1080 });
            await page.setUserAgent(getRandomUserAgent());

            // TURBO MODE: Bloqueio de recursos inúteis e Interceptação de API
            await page.setRequestInterception(true);
            page.on('request', (req) => {
                const type = req.resourceType();
                const url = req.url();

                // Bloqueia Pesos Mortos
                if (['image', 'stylesheet', 'font', 'media'].includes(type)) {
                    req.abort();
                } else {
                    // Log de possíveis APIs (Diagnóstico em runtime)
                    if (url.includes('api') || url.includes('search') || url.includes('graphql') || req.method() === 'POST') {
                        if (!url.includes('google') && !url.includes('facebook')) {
                            console.log(`📡 [${SITE}] Possível API Detectada: ${req.method()} ${url}`);
                        }
                    }
                    req.continue();
                }
            });

            // Navigate to busca page with category 1 (Veículos) e 2 (Motos)
            const categories = [1, 2, 4]; // Veículos, Motos, Caminhões
            for (const cat of categories) {
                console.log(`   🔍 [${SITE}] Navegando para Categoria ${cat} ...`);
                try {
                    await page.goto(`${BASE_URL}/busca/?categoria=${cat}`, { waitUntil: 'networkidle0', timeout: TIMEOUT });
                    await new Promise(r => setTimeout(r, 2000));

                    // Captura itens da página de busca
                    const items = await extractVehiclesFromPage(page, SITE, BASE_URL);
                    if (items.length > 0) {
                        const filtered = filterVehicles(items, BLACKLIST, BRANDS);
                        const newItems = filtered.filter(v => {
                            if (seenIds.has(v.registro)) return false;
                            seenIds.add(v.registro);
                            return true;
                        });
                        if (newItems.length > 0) {
                            await salvarLista(newItems);
                            totalCapturados += newItems.length;
                            console.log(`   ✅ [${SITE}] +${newItems.length} da categoria ${cat}. Total: ${totalCapturados}`);
                        }
                    }
                } catch (e) { console.log(`   ⚠️ [${SITE}] Erro na categoria ${cat}: ${e.message}`); }
            }

            // Find all auction links
            const auctionLinks = await page.evaluate((base) => {
                const links = new Set();
                document.querySelectorAll('a').forEach(a => {
                    const href = a.getAttribute('href') || '';
                    if (href.includes('/leilao/') || href.includes('/leiloes/') || href.includes('/evento/') || href.includes('/lote/')) {
                        const fullUrl = href.startsWith('http') ? href : `${base}${href.startsWith('/') ? '' : '/'}${href}`;
                        links.add(fullUrl);
                    }
                });
                return [...links];
            }, BASE_URL);

            console.log(`   📋 [${SITE}] ${auctionLinks.length} links de interesse encontrados`);

            // Always try the busca page as a source too
            const tryPages = [
                `${BASE_URL}/busca/`,
                `${BASE_URL}/leiloes`,
                `${BASE_URL}/veiculos`,
                `${BASE_URL}/busca/?categoria=1`
            ];

            for (const tryUrl of tryPages) {
                try {
                    await page.goto(tryUrl, { waitUntil: 'networkidle2', timeout: 30000 }).catch(() => { });
                    await new Promise(r => setTimeout(r, 3000));

                    // Deep scroll
                    for (let i = 0; i < 30; i++) {
                        await page.evaluate(() => window.scrollBy(0, 600));
                        await new Promise(r => setTimeout(r, 300));
                    }

                    const items = await extractVehiclesFromPage(page, SITE, BASE_URL);
                    if (items.length > 0) {
                        console.log(`   ✅ [${SITE}] ${tryUrl}: ${items.length} veículos encontrados`);
                        auctionLinks.push(tryUrl); // Already processed
                        const filtered = filterVehicles(items, BLACKLIST, BRANDS);
                        const newItems = filtered.filter(v => {
                            if (seenIds.has(v.registro)) return false;
                            seenIds.add(v.registro);
                            return true;
                        });
                        if (newItems.length > 0) {
                            await salvarLista(newItems);
                            totalCapturados += newItems.length;
                        }
                    }
                } catch (e) {
                    // Ignore navigation errors for try URLs
                }
            }

            // Process each auction link
            for (const link of auctionLinks) {
                try {
                    if (link === `${BASE_URL}/busca/` || link.includes('?categoria=')) continue; // skip already processed
                    console.log(`   🔄 [${SITE}] Processando: ${link}`);
                    await page.goto(link, { waitUntil: 'networkidle2', timeout: TIMEOUT });
                    await new Promise(r => setTimeout(r, 3000));

                    // Deep scroll to load lazy content
                    for (let i = 0; i < 30; i++) {
                        await page.evaluate(() => window.scrollBy(0, 600));
                        await new Promise(r => setTimeout(r, 300));
                    }

                    const items = await extractVehiclesFromPage(page, SITE, BASE_URL);
                    const filtered = filterVehicles(items, BLACKLIST, BRANDS);

                    // Deduplicate
                    const newItems = filtered.filter(v => {
                        if (seenIds.has(v.registro)) return false;
                        seenIds.add(v.registro);
                        return true;
                    });

                    if (newItems.length > 0) {
                        await salvarLista(newItems);
                        totalCapturados += newItems.length;
                        console.log(`   ✅ [${SITE}] +${newItems.length} veículos. Total: ${totalCapturados}`);
                    }

                    // Check for pagination within auction pages
                    let paginaNum = 2;
                    while (paginaNum <= 30) {
                        const hasNext = await page.evaluate(() => {
                            const nextBtn = document.querySelector('a[rel="next"], .pagination .next a, [class*="next"]:not(.disabled), button:has(> .fa-chevron-right)');
                            if (nextBtn) { nextBtn.click(); return true; }
                            const pageLinks = document.querySelectorAll('.pagination a, [class*="page-link"]');
                            let found = false;
                            pageLinks.forEach(a => {
                                if (a.textContent.trim() === 'Próximo' || a.textContent.trim() === '>' || a.textContent.trim() === '›') {
                                    a.click(); found = true;
                                }
                            });
                            return found;
                        });

                        if (!hasNext) break;

                        await new Promise(r => setTimeout(r, 3000));

                        // Scroll again
                        for (let i = 0; i < 10; i++) {
                            await page.evaluate(() => window.scrollBy(0, 600));
                            await new Promise(r => setTimeout(r, 200));
                        }

                        const pageItems = await extractVehiclesFromPage(page, SITE, BASE_URL);
                        const newPageItems = filterVehicles(pageItems, BLACKLIST, BRANDS).filter(v => {
                            if (seenIds.has(v.registro)) return false;
                            seenIds.add(v.registro);
                            return true;
                        });

                        if (newPageItems.length === 0) break;

                        await salvarLista(newPageItems);
                        totalCapturados += newPageItems.length;
                        paginaNum++;
                    }

                    await new Promise(r => setTimeout(r, 500));
                } catch (e) {
                    console.log(`   ⚠️ [${SITE}] Erro processando ${link}: ${e.message}`);
                }
            }

        } catch (e) {
            console.error(`❌ [${SITE}] Erro:`, e.message);
        } finally {
            await browser.close();
        }

        console.log(`✅ [${SITE}] Finalizado! ${totalCapturados} veículos coletados.`);
        return totalCapturados;
    };

    return { buscarTodos, SITE };
};

/**
 * Generic vehicle extraction from any page - tries all possible selectors
 */
async function extractVehiclesFromPage(page, site, baseUrl) {
    return await page.evaluate((siteDomain, base) => {
        const items = [];
        const seen = new Set();

        // Try to find vehicles using any kind of card/list layout
        const selectors = [
            '.dg-leilao-item-card',
            '.card',
            '.lote-item',
            '[class*="lote"]',
            '[class*="item-card"]',
            '[class*="vehicle"]',
            'tr[class*="lote"]',
            'li[class*="lote"]',
            'article'
        ];

        let cards = [];
        for (const sel of selectors) {
            const found = document.querySelectorAll(sel);
            if (found.length > 3) { // Use the selector that finds meaningful amount
                cards = Array.from(found);
                break;
            }
        }

        // If no card selectors work, try finding all links to lot detail pages
        if (cards.length === 0) {
            const allLinks = document.querySelectorAll('a[href*="/lote/"], a[href*="/item/"], a[href*="/veiculo/"]');
            allLinks.forEach(a => {
                const parent = a.closest('div, li, tr, article') || a;
                if (!cards.includes(parent)) cards.push(parent);
            });
        }

        cards.forEach(card => {
            try {
                const text = (card.textContent || '').trim();
                if (text.length < 5 || text.length > 5000) return;

                // Find link
                const linkEl = card.querySelector('a[href*="/lote/"], a[href*="/leilao/"], a[href*="/item/"], a[href*="/veiculo/"]')
                    || card.querySelector('a[href]');
                if (!linkEl) return;

                const href = linkEl.getAttribute('href') || '';
                const fullLink = href.startsWith('http') ? href : `${base}${href.startsWith('/') ? '' : '/'}${href}`;

                if (seen.has(fullLink)) return;
                seen.add(fullLink);

                // Extract title
                let title = '';
                const titleSelectors = [
                    '.dg-leilao-item-titulo', '.titulo', 'h3', 'h5', 'h4',
                    '.card-title', '[class*="titulo"]', '[class*="nome"]', '[class*="descricao"]'
                ];
                for (const sel of titleSelectors) {
                    const el = card.querySelector(sel);
                    if (el && el.textContent.trim().length > 3) {
                        title = el.textContent.trim();
                        break;
                    }
                }
                if (!title) {
                    // Use link text or first text content
                    title = linkEl.textContent.trim().substring(0, 120);
                }
                if (!title || title.length < 3) return;

                // Image
                let imgSrc = '';
                const imgEl = card.querySelector('img');
                if (imgEl) {
                    imgSrc = imgEl.getAttribute('data-src') || imgEl.getAttribute('src') ||
                        imgEl.getAttribute('data-lazy') || imgEl.getAttribute('loading') || '';
                }
                if (!imgSrc) {
                    const bgEl = card.querySelector('[style*="background-image"]');
                    if (bgEl) {
                        const match = bgEl.getAttribute('style')?.match(/url\(['"]?([^'")]+)['"]?\)/);
                        if (match) imgSrc = match[1];
                    }
                }
                if (imgSrc && !imgSrc.startsWith('http')) {
                    imgSrc = `${base}${imgSrc.startsWith('/') ? '' : '/'}${imgSrc}`;
                }

                // Price
                let valor = 0;
                const priceEl = card.querySelector('[class*="valor"], [class*="lance"], [class*="price"]');
                if (priceEl) {
                    const priceText = priceEl.textContent.replace(/[^0-9,]/g, '').replace(',', '.');
                    valor = parseFloat(priceText) || 0;
                }

                // Year
                const statusRaw = card.querySelector('[class*="status"], [class*="badge"], [class*="situacao"]')?.textContent.trim() || '';
                const situacao = standardizeStatus(statusRaw || (text.includes('VENDIDO') ? 'Vendido' : 'Disponível'));

                items.push({
                    registro,
                    site: siteDomain,
                    veiculo: title.toUpperCase().substring(0, 150),
                    link: fullLink,
                    fotos: imgSrc && !imgSrc.includes('no-image') && !imgSrc.includes('placeholder') ? [imgSrc] : [],
                    valor,
                    ano: yearMatch ? parseInt(yearMatch[0]) : null,
                    localLeilao: 'MG / BR',
                    modalidade: 'leilao',
                    tipo: classifyVehicle(title),
                    situacao: situacao
                });
            } catch (e) { }
        });

        return items.filter(item => item && item.fotos && item.fotos.length > 0);
    }, site, baseUrl);
}

function filterVehicles(items, blacklist, brands) {
    return items.filter(v => {
        const text = v.veiculo.toUpperCase();
        const isBlacklisted = blacklist.some(b => text.includes(b));
        const hasBrand = brands.some(b => text.includes(b));
        if (isBlacklisted && !hasBrand) return false;
        return true;
    });
}

export default createCrawler;
