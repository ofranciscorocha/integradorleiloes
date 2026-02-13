import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import dotenv from 'dotenv';
import connectDatabase from '../../database/db.js';

dotenv.config();
puppeteer.use(StealthPlugin());

let db;

const TIMEOUT = parseInt(process.env.CRAWLER_TIMEOUT_MS) || 120000;
const SITE = 'copart.com.br';

const run = async () => {
    try {
        const connection = await connectDatabase();
        db = connection;
        console.log(`🚀 [${SITE}] SUPERCRAWLER: Iniciando captura avançada...`);
        await buscarListaPrincipal();
        console.log(`--- ✅ [${SITE}] Finalizado ---`);
        process.exit(0);
    } catch (error) {
        console.error('❌ Erro fatal:', error);
        process.exit(1);
    }
};

const buscarListaPrincipal = async () => {
    const browser = await puppeteer.launch({
        headless: "new",
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--window-size=1920,1080',
            '--disable-blink-features=AutomationControlled',
            '--disable-features=IsolateOrigins,site-per-process',
            '--disable-web-security'
        ]
    });

    let totalCapturados = 0;
    const seenIds = new Set();

    try {
        const page = await browser.newPage();

        // Advanced stealth: Override navigator properties
        await page.evaluateOnNewDocument(() => {
            // Override webdriver detection
            Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
            // Override chrome
            window.chrome = { runtime: {} };
            // Override permissions
            const originalQuery = window.navigator.permissions.query;
            window.navigator.permissions.query = (parameters) =>
                parameters.name === 'notifications'
                    ? Promise.resolve({ state: Notification.permission })
                    : originalQuery(parameters);
            // Override plugins
            Object.defineProperty(navigator, 'plugins', {
                get: () => [1, 2, 3, 4, 5]
            });
            // Override languages
            Object.defineProperty(navigator, 'languages', {
                get: () => ['pt-BR', 'pt', 'en-US', 'en']
            });
        });

        await page.setViewport({ width: 1366, height: 768 });
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36');

        // Set extra headers to look more legitimate
        await page.setExtraHTTPHeaders({
            'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
            'sec-ch-ua': '"Not A(Brand";v="99", "Google Chrome";v="121", "Chromium";v="121"',
            'sec-ch-ua-mobile': '?0',
            'sec-ch-ua-platform': '"Windows"',
            'Sec-Fetch-Dest': 'document',
            'Sec-Fetch-Mode': 'navigate',
            'Sec-Fetch-Site': 'none',
            'Sec-Fetch-User': '?1'
        });

        // STRATEGY 1: API Intercept
        console.log(`   📡 [${SITE}] Configurando interceptação de API...`);

        page.on('response', async response => {
            const url = response.url();
            if (url.includes('lotSearchResults') || url.includes('api/v1') || url.includes('search') || url.includes('/lots')) {
                const contentType = response.headers()['content-type'] || '';
                if (contentType.includes('json')) {
                    try {
                        const data = await response.json();
                        const lots = extractLotsFromResponse(data);
                        if (lots.length > 0) {
                            const newLots = lots.filter(l => !seenIds.has(l.registro));
                            newLots.forEach(l => seenIds.add(l.registro));
                            if (newLots.length > 0) {
                                await db.salvarLista(newLots);
                                totalCapturados += newLots.length;
                                console.log(`   🔸 [${SITE}] API Intercept: +${newLots.length} veículos. Total: ${totalCapturados}`);
                            }
                        }
                    } catch (e) { }
                }
            }
        });

        // Navigate to main page first (to get cookies)
        console.log(`   🔍 [${SITE}] Navegando para homepage...`);
        await page.goto('https://www.copart.com.br/', { waitUntil: 'networkidle2', timeout: TIMEOUT });

        // Simulate human behavior: random mouse movements
        await humanDelay(page, 2000, 4000);
        await simulateHuman(page);

        // Navigate to search results
        console.log(`   🔍 [${SITE}] Navegando para busca de lotes...`);
        await page.goto('https://www.copart.com.br/lotSearchResults/?free=true&query=', {
            waitUntil: 'networkidle2',
            timeout: TIMEOUT
        });

        await humanDelay(page, 3000, 5000);

        // STRATEGY 2: DOM Table Scraping (if Incapsula is bypassed)
        console.log(`   🔍 [${SITE}] Verificando carregamento da tabela...`);

        try {
            await page.waitForSelector('#serverSideDataTable tbody tr, .lot-card, [class*="lot"], [class*="vehicle"]', { timeout: 20000 });
            console.log(`   ✅ [${SITE}] Tabela/Cards detectados! Iniciando scraping...`);

            // Paginate through all pages
            for (let p = 1; p <= 100; p++) {
                const veiculos = await page.evaluate(() => {
                    const items = [];

                    // Try table format
                    const rows = document.querySelectorAll('table#serverSideDataTable tbody tr, table tbody tr');
                    rows.forEach(row => {
                        try {
                            const linkEl = row.querySelector('a[data-uname="lotSearchResultLotNumber"], a[href*="/lot/"], a');
                            const nameEl = row.querySelector('a[data-uname="lotSearchResultLotName"], .lot-name, td:nth-child(3)');
                            const imgEl = row.querySelector('img.img-responsive, img');
                            const priceEl = row.querySelector('span[data-uname="lotSearchResultHighBid"], .price, td:nth-child(5)');
                            const locationEl = row.querySelector('td[data-uname="lotSearchResultLocation"], .location, td:nth-child(6)');

                            if (!linkEl) return;

                            const text = (nameEl || linkEl).innerText.trim();
                            if (text.length < 3) return;

                            items.push({
                                registro: linkEl.innerText.trim().replace(/\D/g, '') || linkEl.href?.split('/').pop() || '',
                                site: 'copart.com.br',
                                link: linkEl.href || '',
                                veiculo: text.toUpperCase(),
                                fotos: imgEl && imgEl.src && !imgEl.src.includes('data:image') ? [imgEl.src] : [],
                                valor: priceEl ? parseFloat(priceEl.innerText.replace(/[^0-9,]/g, '').replace(',', '.')) || 0 : 0,
                                localLeilao: locationEl ? locationEl.innerText.trim() : 'Brasil',
                                modalidade: 'leilao',
                                tipo: 'veiculo'
                            });
                        } catch (e) { }
                    });

                    // Try card format
                    if (items.length === 0) {
                        const cards = document.querySelectorAll('.lot-card, [class*="lot-item"], [class*="vehicle-card"]');
                        cards.forEach(card => {
                            try {
                                const linkEl = card.querySelector('a');
                                const text = card.innerText;
                                const imgEl = card.querySelector('img');
                                if (!linkEl || text.length < 10) return;

                                const yearMatch = text.match(/(20[0-2]\d|19[89]\d)/);
                                const priceMatch = text.match(/R?\$?\s?[\d.,]+/);

                                items.push({
                                    registro: linkEl.href?.split('/').pop() || '',
                                    site: 'copart.com.br',
                                    link: linkEl.href || '',
                                    veiculo: text.split('\n')[0].trim().toUpperCase(),
                                    fotos: imgEl?.src ? [imgEl.src] : [],
                                    valor: priceMatch ? parseFloat(priceMatch[0].replace(/[R$\s.]/g, '').replace(',', '.')) || 0 : 0,
                                    localLeilao: 'Brasil',
                                    ano: yearMatch ? parseInt(yearMatch[1]) : null,
                                    modalidade: 'leilao',
                                    tipo: 'veiculo'
                                });
                            } catch (e) { }
                        });
                    }

                    return items;
                });

                // Filter out non-vehicle items
                const filtered = veiculos.filter(v => {
                    const text = v.veiculo.toUpperCase();
                    const blacklist = ['MOVEIS', 'ELETRO', 'INFORMÁTICA', 'SUCATA DE FERRO', 'PEÇAS', 'IMOVEL', 'TERRENO', 'NOTEBOOK', 'CELULAR'];
                    return v.registro && !blacklist.some(b => text.includes(b));
                }).filter(v => !seenIds.has(v.registro));

                filtered.forEach(v => seenIds.add(v.registro));

                if (filtered.length > 0) {
                    await db.salvarLista(filtered);
                    totalCapturados += filtered.length;
                    console.log(`   ✅ [${SITE}] Página ${p}: +${filtered.length} veículos. Total: ${totalCapturados}`);
                }

                if (veiculos.length === 0) {
                    console.log(`   🔸 [${SITE}] Fim dos resultados na página ${p}.`);
                    break;
                }

                // Try to click next page
                const hasNext = await page.evaluate(() => {
                    // AngularJS pagination
                    const nextBtns = document.querySelectorAll('.pagination a, [ng-click*="next"], [data-uname*="next"], button[ng-click*="next"]');
                    for (const btn of nextBtns) {
                        if (!btn.parentElement?.classList?.contains('disabled') && btn.offsetParent !== null) {
                            btn.click();
                            return true;
                        }
                    }
                    // Also try aria-label based
                    const ariaNext = document.querySelector('[aria-label="Next"], [aria-label="next"]');
                    if (ariaNext) {
                        ariaNext.click();
                        return true;
                    }
                    return false;
                });

                if (!hasNext) {
                    console.log(`   🔸 [${SITE}] Sem botão de próxima página.`);
                    break;
                }

                await humanDelay(page, 2000, 4000);
                await page.waitForFunction(() => {
                    return document.querySelectorAll('#serverSideDataTable tbody tr, .lot-card').length > 0;
                }, { timeout: 15000 }).catch(() => null);
            }
        } catch (e) {
            console.log(`   ⚠️ [${SITE}] Tabela não carregou: ${e.message}`);
            console.log(`   🔄 [${SITE}] Tentando estratégia alternativa...`);

            // STRATEGY 3: Direct search URLs with different parameters
            const searchUrls = [
                'https://www.copart.com.br/lotSearchResults/?free=true&query=&page=1',
                'https://www.copart.com.br/vehicleFinder/',
                'https://www.copart.com.br/todaysAuction/',
            ];

            for (const searchUrl of searchUrls) {
                try {
                    console.log(`   🔍 [${SITE}] Tentando: ${searchUrl}`);
                    await page.goto(searchUrl, { waitUntil: 'networkidle2', timeout: TIMEOUT });
                    await humanDelay(page, 3000, 5000);
                    await simulateHuman(page);

                    // Check if page loaded properly (not blocked by Incapsula)
                    const isBlocked = await page.evaluate(() => {
                        const html = document.documentElement.innerHTML;
                        return html.includes('incapsula') || html.includes('_Incapsula') ||
                            html.includes('Request unsuccessful') || html.includes('Access Denied') ||
                            html.length < 2000;
                    });

                    if (isBlocked) {
                        console.log(`   🚫 [${SITE}] Página bloqueada pelo anti-bot em ${searchUrl}`);
                        continue;
                    }

                    // Try to extract whatever we can
                    const content = await page.evaluate(() => {
                        const links = [];
                        document.querySelectorAll('a[href*="/lot/"]').forEach(a => {
                            links.push({
                                href: a.href,
                                text: a.innerText.trim()
                            });
                        });
                        return { links, bodyLength: document.body.innerText.length };
                    });

                    console.log(`   📊 [${SITE}] ${searchUrl}: ${content.links.length} links encontrados, body: ${content.bodyLength} chars`);

                    const veiculos = content.links
                        .filter(l => l.href && l.text.length > 3)
                        .map(l => ({
                            registro: l.href.split('/').pop(),
                            site: SITE,
                            link: l.href,
                            veiculo: l.text.toUpperCase(),
                            fotos: [],
                            valor: 0,
                            localLeilao: 'Brasil',
                            modalidade: 'leilao',
                            tipo: 'veiculo'
                        }))
                        .filter(v => !seenIds.has(v.registro));

                    veiculos.forEach(v => seenIds.add(v.registro));

                    if (veiculos.length > 0) {
                        await db.salvarLista(veiculos);
                        totalCapturados += veiculos.length;
                        console.log(`   ✅ [${SITE}] Fallback: +${veiculos.length} veículos.`);
                    }
                } catch (e) {
                    console.log(`   ⚠️ [${SITE}] Erro em ${searchUrl}: ${e.message}`);
                }
            }
        }

        console.log(`   📊 [${SITE}] Total final: ${totalCapturados} veículos capturados.`);

    } catch (error) {
        console.error(`❌ [${SITE}] Erro no crawler:`, error.message);
    } finally {
        await browser.close();
    }
};

function extractLotsFromResponse(data) {
    const lots = [];

    // Try various response structures
    const items = data.data?.lots || data.results || data.lots || data.data?.results || data.content || data.items || [];

    if (Array.isArray(items)) {
        items.forEach(item => {
            try {
                const id = String(item.lotNumberStr || item.ln || item.lotId || item.id || item.lot_number || '');
                if (!id) return;

                lots.push({
                    registro: id,
                    site: SITE,
                    link: `https://www.copart.com.br/lot/${id}`,
                    veiculo: (item.mkn || item.mdn || item.lotDescription || item.la || item.description || item.make + ' ' + item.model || 'Veículo Copart').toUpperCase(),
                    fotos: item.tims || item.images || item.imageUrl ? (Array.isArray(item.tims) ? item.tims.map(i => i.url || i) : [item.imageUrl || item.tims]) : [],
                    valor: parseFloat(item.hb || item.currentBid || item.dynamicHb || item.price || 0),
                    ano: item.lcy || item.yr || item.year || null,
                    localLeilao: item.lng || item.locationName || item.facilityState || 'Brasil',
                    modalidade: 'leilao',
                    tipo: 'veiculo'
                });
            } catch (e) { }
        });
    }

    return lots;
}

async function humanDelay(page, min, max) {
    const delay = Math.floor(Math.random() * (max - min)) + min;
    await new Promise(r => setTimeout(r, delay));
}

async function simulateHuman(page) {
    try {
        // Random mouse movements
        const width = 1366;
        const height = 768;
        for (let i = 0; i < 3; i++) {
            await page.mouse.move(
                Math.floor(Math.random() * width),
                Math.floor(Math.random() * height)
            );
            await new Promise(r => setTimeout(r, Math.random() * 500 + 200));
        }
        // Small scroll
        await page.evaluate(() => window.scrollBy(0, Math.random() * 300 + 100));
    } catch (e) { }
}

// Create crawler wrapper for compatibility
const createCrawler = (database) => {
    db = database;
    return {
        buscarTodos: buscarListaPrincipal,
        SITE
    };
};

if (process.argv[1]?.includes('copart')) {
    run();
}

export default { run, buscarListaPrincipal, createCrawler };
