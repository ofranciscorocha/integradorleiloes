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
        await execute(db);
    } catch (e) {
        console.error(`❌ [${SITE}] Fatal:`, e.message);
    }
    process.exit(0);
};

const execute = async (database) => {
    db = database;
    console.log(`🚀 [${SITE}] SUPERCRAWLER: Iniciando captura via API dentro do browser...`);

    const browser = await puppeteer.launch({
        headless: "new",
        args: [
            '--no-sandbox', '--disable-setuid-sandbox',
            '--disable-dev-shm-usage', '--disable-gpu',
            '--single-process', '--no-zygote',
            '--disable-blink-features=AutomationControlled',
            '--window-size=1280,720'
        ]
    });

    let capturados = 0;
    const seenIds = new Set();

    try {
        const page = await browser.newPage();
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36');
        await page.setViewport({ width: 1920, height: 1080 });

        // Intercept API responses automatically
        const apiResponses = [];
        page.on('response', async response => {
            const url = response.url();
            if (url.includes('/public/lots/search') || url.includes('lotSearchResults')) {
                try {
                    const data = await response.json();
                    apiResponses.push(data);
                } catch (e) { }
            }
        });

        // Navigate to the main page first to establish session
        console.log(`   🔍 [${SITE}] Estabelecendo sessão...`);
        await page.goto('https://www.copart.com.br', { waitUntil: 'networkidle2', timeout: TIMEOUT });
        await new Promise(r => setTimeout(r, 5000));

        // Check if we passed the anti-bot
        const pageTitle = await page.title();
        const pageContent = await page.content();
        const hasAngularApp = pageContent.includes('ng-app') || pageContent.includes('copart');
        console.log(`   📊 [${SITE}] Title: "${pageTitle}" | AngularJS loaded: ${hasAngularApp}`);

        if (!hasAngularApp) {
            console.log(`   ❌ [${SITE}] Anti-bot não resolvido. Tentando esperar mais...`);
            await new Promise(r => setTimeout(r, 15000));
        }

        // Navigate to search results page
        console.log(`   🔍 [${SITE}] Navegando para resultados de busca...`);
        await page.goto('https://www.copart.com.br/lotSearchResults/?free=true&query=%2A', {
            waitUntil: 'networkidle2', timeout: TIMEOUT
        });
        await new Promise(r => setTimeout(r, 5000));

        // ===== STRATEGY 1: Use Copart's internal API via page.evaluate =====
        console.log(`   🔄 [${SITE}] STRATEGY 1: API direta via browser context...`);

        // Get cookies and XSRF token from page
        const cookies = await page.cookies();
        const cookieStr = cookies.map(c => `${c.name}=${c.value}`).join('; ');
        const xsrfCookie = cookies.find(c => c.name.includes('XSRF') || c.name.includes('csrf'));
        console.log(`   🔑 [${SITE}] ${cookies.length} cookies obtidos.`);

        // Copart Brazil search API
        const API_URL = 'https://www.copart.com.br/public/lots/search';

        // Paginate through all results
        for (let page_num = 0; page_num < 500; page_num++) {
            try {
                console.log(`   🔄 [${SITE}] API: Solicitando página ${page_num}...`);
                const result = await page.evaluate(async (apiUrl, pageNum, pageSize) => {
                    try {
                        const metaCSRF = document.querySelector('meta[name="_csrf"]')?.getAttribute('content') || '';

                        const response = await fetch(apiUrl, {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/json',
                                'Accept': 'application/json',
                                'X-Requested-With': 'XMLHttpRequest',
                                'X-XSRF-TOKEN': metaCSRF
                            },
                            credentials: 'include',
                            body: JSON.stringify({
                                query: '*',
                                filter: {},
                                sort: ['auction_date_type_dummy_field ASC', 'lot_auction_open_date_dt ASC'],
                                page: pageNum,
                                size: pageSize,
                                start: pageNum * pageSize,
                                watchListOnly: false,
                                freeFormSearch: true,
                                hideImages: false,
                                defaultSort: false,
                                specificRowProvided: false,
                                displayName: '',
                                searchName: ''
                            })
                        });

                        if (!response.ok) return { error: `HTTP ${response.status}`, items: [] };
                        return await response.json();
                    } catch (e) {
                        return { error: e.message, items: [] };
                    }
                }, API_URL, page_num, 100);

                if (!result || result.error) {
                    console.log(`   ⚠️ [${SITE}] API error page ${page_num}: ${result?.error || 'Unknown error'}`);
                    if (page_num > 5) break;
                    continue;
                }

                // Extract lots from response
                const lots = extractLotsFromResponse(result);
                if (!lots || lots.length === 0) {
                    console.log(`   🔸 [${SITE}] Nenhum lote na página ${page_num}.`);
                    if (page_num > 15) break;
                    continue;
                }

                // Deduplicate
                let newCount = 0;
                for (const l of lots) {
                    if (!seenIds.has(l.registro)) {
                        seenIds.add(l.registro);
                        await db.salvarLista([l]);
                        newCount++;
                        capturados++;
                    }
                }

                if (newCount > 0) {
                    console.log(`   ✅ [${SITE}] Página ${page_num}: +${newCount} novos. Total: ${capturados}`);
                } else {
                    console.log(`   🔸 [${SITE}] Página ${page_num}: Todos duplicados.`);
                    if (page_num > 20) break; // If we hit 20 pages of total duplicates, we probably caught up
                }

                // Check if we've reached the end
                const totalResults = result.data?.results?.totalElements ||
                    result.results?.totalElements ||
                    result.totalElements || 0;
                if (totalResults > 0 && (page_num + 1) * 100 >= totalResults) {
                    console.log(`   📊 [${SITE}] Total API: ${totalResults}. Coletados: ${capturados}. Fim.`);
                    break;
                }

                await new Promise(r => setTimeout(r, 600));

            } catch (e) {
                console.log(`   ⚠️ [${SITE}] Erro página ${page_num}: ${e.message}`);
                if (page_num > 3) break;
            }
        }

        // ===== STRATEGY 2: If API didn't work, try DOM scraping =====
        if (capturados < 20) {
            console.log(`   🔄 [${SITE}] STRATEGY 2: DOM scraping com paginação...`);

            await page.goto('https://www.copart.com.br/lotSearchResults/?free=true&query=%2A', {
                waitUntil: 'networkidle2', timeout: TIMEOUT
            });
            await new Promise(r => setTimeout(r, 5000));

            // Scroll to load items
            for (let s = 0; s < 20; s++) {
                await page.evaluate(() => window.scrollBy(0, 800));
                await new Promise(r => setTimeout(r, 500));
            }

            // Extract from DOM
            const domItems = await page.evaluate((site) => {
                const items = [];
                // Copart uses table rows or card divs for results
                const rows = document.querySelectorAll('tbody tr, [class*="lot-row"], [class*="lot-card"], tr[ng-repeat], .p-datatable-row, .lot-list-item, [ng-repeat*="lot"]');

                rows.forEach(row => {
                    try {
                        const linkEl = row.querySelector('a[href*="/lot/"]') || row.querySelector('a[href*="/lote/"]');
                        const imgEl = row.querySelector('img');
                        const titleEl = row.querySelector('[class*="lot-desc"], [class*="lot-name"], .lot-title, td:nth-child(3), .vehicle-name');
                        const yearEl = row.querySelector('[class*="lot-year"], [class*="lot-ano"]');
                        const priceEl = row.querySelector('[class*="bid-value"], [class*="lot-price"]');
                        const yardEl = row.querySelector('[class*="yard-name"], [class*="lot-location"]');

                        if (!linkEl) return;

                        const link = linkEl.href;
                        const lotId = link.match(/\/lot\/(\d+)/)?.[1] || link.split('/').pop();

                        let title = titleEl ? titleEl.textContent.trim() : '';
                        if (!title && linkEl) title = linkEl.textContent.trim();

                        let imgSrc = '';
                        if (imgEl) {
                            imgSrc = imgEl.getAttribute('src') || imgEl.getAttribute('data-src') || imgEl.getAttribute('ng-src') || '';
                        }

                        items.push({
                            registro: String(lotId),
                            site: site,
                            veiculo: title.toUpperCase(),
                            link: link,
                            fotos: imgSrc && !imgSrc.includes('no-image') ? [imgSrc] : [],
                            valor: priceEl ? parseFloat(priceEl.textContent.replace(/[^0-9,]/g, '').replace(',', '.')) : 0,
                            ano: yearEl ? parseInt(yearEl.textContent) : null,
                            localLeilao: yardEl ? yardEl.textContent.trim() : 'Brasil',
                            modalidade: 'leilao',
                            tipo: 'veiculo'
                        });
                    } catch (e) { }
                });
                return items;
            }, SITE);

            // Also try intercepted API responses
            for (const apiData of apiResponses) {
                const lots = extractLotsFromResponse(apiData);
                const newLots = lots.filter(l => {
                    if (seenIds.has(l.registro)) return false;
                    seenIds.add(l.registro);
                    return true;
                });
                if (newLots.length > 0) {
                    await db.salvarLista(newLots);
                    capturados += newLots.length;
                    console.log(`   ✅ [${SITE}] API interceptada: +${newLots.length}. Total: ${capturados}`);
                }
            }

            const newDomItems = domItems.filter(l => {
                if (seenIds.has(l.registro)) return false;
                seenIds.add(l.registro);
                return true;
            });
            if (newDomItems.length > 0) {
                await db.salvarLista(newDomItems);
                capturados += newDomItems.length;
                console.log(`   ✅ [${SITE}] DOM: +${newDomItems.length}. Total: ${capturados}`);
            }
        }

        // ===== STRATEGY 3: Click pagination and scrape each page =====
        if (capturados < 20) {
            console.log(`   🔄 [${SITE}] STRATEGY 3: Paginação via clicks no browser...`);

            await page.goto('https://www.copart.com.br/lotSearchResults/?free=true&query=%2A', {
                waitUntil: 'networkidle2', timeout: TIMEOUT
            });
            await new Promise(r => setTimeout(r, 8000));

            // Try to change page size to max
            const pageSizeSelector = 'select[ng-model*="pageSize"], select[ng-model*="rowsPerPage"], .p-dropdown';
            const hasPageSize = await page.$(pageSizeSelector);
            if (hasPageSize) {
                await page.select(pageSizeSelector, '100').catch(() => { });
                await new Promise(r => setTimeout(r, 3000));
            }

            for (let domPage = 0; domPage < 100; domPage++) {
                // Wait for content
                await new Promise(r => setTimeout(r, 3000));

                // Scrape current page
                const pageItems = await page.evaluate((site) => {
                    const items = [];
                    // Try all possible selectors for Copart
                    const allElements = document.querySelectorAll('a[href*="/lot/"], a[href*="/lote/"]');
                    const seen = new Set();

                    allElements.forEach(a => {
                        const href = a.href;
                        if (seen.has(href)) return;
                        seen.add(href);

                        const row = a.closest('tr, [class*="lot-row"], [class*="lot-card"], .p-datatable-row, li, div[class*="item"]');
                        if (!row) return;

                        const lotId = href.match(/\/lot\/(\d+)/)?.[1] || href.match(/\/lote\/(\d+)/)?.[1] || href.split('/').pop();
                        const imgEl = row.querySelector('img');
                        let title = '';

                        // Try extracting title from various elements
                        const titleCandidates = row.querySelectorAll('span, td, div, p');
                        for (const el of titleCandidates) {
                            const text = el.textContent.trim();
                            if (text.length > 5 && text.length < 100 && !text.includes('R$') && !text.match(/^\d+$/)) {
                                title = text;
                                break;
                            }
                        }

                        let imgSrc = '';
                        if (imgEl) {
                            imgSrc = imgEl.getAttribute('src') || imgEl.getAttribute('data-src') ||
                                imgEl.getAttribute('ng-src') || imgEl.getAttribute('lazy-src') || '';
                        }

                        if (lotId) {
                            items.push({
                                registro: String(lotId),
                                site: site,
                                veiculo: (title || 'VEÍCULO COPART').toUpperCase(),
                                link: href,
                                fotos: imgSrc && !imgSrc.includes('no-image') && !imgSrc.includes('placeholder') ? [imgSrc] : [],
                                valor: 0,
                                localLeilao: 'Brasil',
                                modalidade: 'leilao',
                                tipo: 'veiculo'
                            });
                        }
                    });
                    return items;
                }, SITE);

                const newPageItems = pageItems.filter(l => {
                    if (seenIds.has(l.registro)) return false;
                    seenIds.add(l.registro);
                    return true;
                });

                if (newPageItems.length > 0) {
                    await db.salvarLista(newPageItems);
                    capturados += newPageItems.length;
                    console.log(`   ✅ [${SITE}] DOM página ${domPage + 1}: +${newPageItems.length}. Total: ${capturados}`);
                }

                // Try to click next page
                const hasNext = await page.evaluate(() => {
                    const nextBtn = document.querySelector('.p-paginator-next:not(.p-disabled), a[ng-click*="next"], .pagination .next a, [class*="next-page"]:not(.disabled), button[aria-label="Next"]');
                    if (nextBtn) {
                        nextBtn.click();
                        return true;
                    }
                    // Also try page number links
                    const pageLinks = document.querySelectorAll('.p-paginator-page, .pagination li a');
                    const current = document.querySelector('.p-paginator-page.p-highlight, .pagination .active');
                    if (current) {
                        const nextSibling = current.closest('li, button')?.nextElementSibling;
                        if (nextSibling) {
                            const link = nextSibling.querySelector('a, button') || nextSibling;
                            link.click();
                            return true;
                        }
                    }
                    return false;
                });

                if (!hasNext) {
                    console.log(`   🔸 [${SITE}] Sem próxima página. Fim da paginação DOM.`);
                    break;
                }

                await new Promise(r => setTimeout(r, 2000));
            }
        }

    } catch (e) {
        console.error(`❌ [${SITE}] Erro:`, e.message);
    } finally {
        await browser.close();
        console.log(`✅ [${SITE}] Coleção finalizada: ${capturados} veículos encontrados.`);
    }
};

/**
 * Extract lots from various Copart API response formats
 */
function extractLotsFromResponse(response) {
    // Try different response structures
    let items = [];

    if (response?.data?.results?.content) {
        items = response.data.results.content;
    } else if (response?.results?.content) {
        items = response.results.content;
    } else if (response?.data?.content) {
        items = response.data.content;
    } else if (response?.content) {
        items = response.content;
    } else if (Array.isArray(response?.data?.results)) {
        items = response.data.results;
    } else if (Array.isArray(response?.results)) {
        items = response.results;
    } else if (Array.isArray(response?.data)) {
        items = response.data;
    } else if (Array.isArray(response)) {
        items = response;
    } else if (response?.data?.results?.lotDetails) {
        items = response.data.results.lotDetails;
    }

    if (!Array.isArray(items) || items.length === 0) return [];

    return items.map(item => {
        try {
            const id = String(
                item.lotNumberStr || item.ln || item.lot_number_str ||
                item.lotId || item.id || item.lot_number || item.lnb || ''
            );
            if (!id || id.length < 3) return null;

            // Build vehicle name from available fields
            let veiculo = '';
            if (item.mkn && item.mdn) {
                veiculo = `${item.mkn} ${item.mdn}`;
            } else if (item.ld) {
                veiculo = item.ld;
            } else if (item.lotDescription) {
                veiculo = item.lotDescription;
            } else if (item.lng) {
                veiculo = item.lng;
            } else if (item.lotName) {
                veiculo = item.lotName;
            } else {
                veiculo = `${item.makeName || item.make || ''} ${item.modelName || item.model || ''}`.trim();
            }

            if (!veiculo) return null;

            // Year — use vehicle year fields, NOT auction cycle
            const ano = item.yr || item.yy || item.lcy ||
                item.year || item.lot_year || item.vehicleYear || null;

            // Location — use yard/facility fields, NOT lot name  
            const localLeilao = item.yn || item.yardName || item.fcy || item.facilityCity ||
                item.location || item.cityName || item.stateName || 'Brasil';

            // Photos
            let fotos = [];
            if (item.tims && Array.isArray(item.tims)) {
                fotos = item.tims.map(t => t.includes('http') ? t : `https://cs.copart.com/v1/AUTH_svc.pdoc00001/${t}`);
            } else if (item.imageUrl) {
                fotos = [item.imageUrl];
            } else if (item.iu) {
                fotos = [item.iu.includes('http') ? item.iu : `https://cs.copart.com/v1/AUTH_svc.pdoc00001/${item.iu}`];
            } else if (item.dynamicImageUrl) {
                fotos = [item.dynamicImageUrl];
            } else if (item.lotImages && Array.isArray(item.lotImages)) {
                fotos = item.lotImages.map(i => i.url || i).filter(Boolean);
            }

            // Value
            const valor = parseFloat(item.hb || item.currentBid || item.highBid || item.la || 0);

            // Build link
            const link = `https://www.copart.com.br/lot/${id}`;

            return {
                registro: id,
                site: SITE,
                link,
                veiculo: veiculo.toUpperCase(),
                fotos,
                valor,
                ano: parseInt(ano) || null,
                localLeilao: String(localLeilao).substring(0, 100),
                modalidade: 'leilao',
                tipo: 'veiculo'
            };
        } catch (e) {
            return null;
        }
    }).filter(Boolean);
}

// Create the standard createCrawler wrapper
const createCrawler = (db) => {
    const buscarTodos = async () => {
        await execute(db);
    };
    return { buscarTodos, SITE };
};

if (process.argv[1]?.includes('copart')) {
    run();
}

export { execute };
export default createCrawler;
