import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import dotenv from 'dotenv';
import { getExecutablePath, getCommonArgs } from '../../utils/browser.js';

dotenv.config();
puppeteer.use(StealthPlugin());

const TIMEOUT = parseInt(process.env.CRAWLER_TIMEOUT_MS) || 60000;
const CONCURRENCY = 2;

const createCrawler = (db) => {
    const { salvarLista } = db;
    const SITE = 'freitasleiloeiro.com.br';
    const BASE_URL = 'https://www.freitasleiloeiro.com.br';

    const extractVehiclesFromPage = async (page, site) => {
        return await page.evaluate((siteDomain) => {
            const found = [];
            const cards = document.querySelectorAll('.cardlote');

            cards.forEach(card => {
                const linkEl = card.querySelector('a');
                const titleEl = card.querySelector('.cardLote-descVeic');
                if (!linkEl || !titleEl) return;

                const title = titleEl.innerText.trim();
                if (!title || title.length < 3) return;

                const url = linkEl.href;
                const registro = card.querySelector('.cardLote-lote')?.innerText.replace('Lote:', '').trim() || url.split('=').pop();

                // ===== IMAGE EXTRACTION - handle multiple sources =====
                let imgSrc = '';
                const imgEl = card.querySelector('.cardLote-img, img');
                if (imgEl) {
                    if (imgEl.tagName === 'IMG') {
                        // Real <img> tag - check all possible attributes
                        imgSrc = imgEl.getAttribute('src') || '';
                        if (!imgSrc || imgSrc.includes('data:image') || imgSrc.includes('placeholder') || imgSrc.includes('no-image')) {
                            imgSrc = imgEl.getAttribute('data-src') || imgEl.getAttribute('data-lazy') ||
                                imgEl.getAttribute('data-original') || imgEl.getAttribute('loading-src') || '';
                        }
                    } else {
                        // Might be a div with background-image
                        const style = imgEl.getAttribute('style') || '';
                        const bgMatch = style.match(/background-image\s*:\s*url\(['"]?([^'")\s]+)['"]?\)/i);
                        if (bgMatch) {
                            imgSrc = bgMatch[1];
                        }
                        // Also check for img inside
                        const innerImg = imgEl.querySelector('img');
                        if (innerImg && !imgSrc) {
                            imgSrc = innerImg.getAttribute('src') || innerImg.getAttribute('data-src') || '';
                        }
                    }
                }

                // Clean up image URL
                if (imgSrc && (imgSrc.includes('data:image') || imgSrc.includes('placeholder') || imgSrc.includes('no-image') || imgSrc.length < 10)) {
                    imgSrc = '';
                }

                // Make relative URLs absolute
                if (imgSrc && !imgSrc.startsWith('http')) {
                    imgSrc = imgSrc.startsWith('/') ? `https://www.freitasleiloeiro.com.br${imgSrc}` : `https://www.freitasleiloeiro.com.br/${imgSrc}`;
                }

                // ===== PRICE =====
                const priceEl = card.querySelector('.cardLote-vlr');
                let valor = 0;
                if (priceEl) {
                    const priceText = priceEl.innerText.replace(/[^0-9,.]/g, '');
                    valor = parseFloat(priceText.replace(/\./g, '').replace(',', '.')) || 0;
                }

                // ===== YEAR extraction from title =====
                const yearMatch = title.match(/\b(19[89]\d|20[0-2]\d)\b/);

                // ===== LOCATION - try to extract from card or auction context =====
                const locEl = card.querySelector('.cardLote-local, .local, .patio');
                const localLeilao = locEl ? locEl.innerText.trim() : '';

                found.push({
                    registro,
                    site: siteDomain,
                    veiculo: title.toUpperCase(),
                    link: url,
                    fotos: imgSrc ? [imgSrc] : [],
                    valor,
                    ano: yearMatch ? parseInt(yearMatch[1]) : null,
                    localLeilao: localLeilao || 'SP',
                    modalidade: 'leilao',
                    tipo: 'veiculo'
                });
            });
            return found;
        }, site);
    };

    const extractLinksFromPage = async (page) => {
        return await page.evaluate(() => {
            const links = [];
            const cards = document.querySelectorAll('.cardlote');
            cards.forEach(card => {
                const linkEl = card.querySelector('a');
                if (linkEl) links.push(linkEl.href);
            });
            return links;
        });
    };

    const scrapeLotPage = async (page, url) => {
        try {
            // Railway resilience: retry navigation if it fails
            let lotLoaded = false;
            for (let i = 0; i < 2; i++) {
                try {
                    await page.goto(url, { waitUntil: 'networkidle2', timeout: TIMEOUT });
                    // Verify if important elements are present
                    await page.waitForSelector('h1, .titulo-lote, .cardLote-descVeic', { timeout: 10000 });
                    lotLoaded = true;
                    break;
                } catch (e) {
                    console.log(`      ⚠️ [${SITE}] Retrying lot page load (${i + 1}/2)...`);
                    await new Promise(r => setTimeout(r, 2000));
                }
            }
            if (!lotLoaded) return null;

            // Extra wait to ensure all lazy elements are ready in production
            await new Promise(r => setTimeout(r, 2000));

            // Extract details
            const data = await page.evaluate((siteDomain) => {
                const titleEl = document.querySelector('h1, .titulo-lote, .lote-titulo, .cardLote-descVeic');
                // Enhanced title fallback
                let title = (document.querySelector('.lote-header h1') || document.querySelector('h1') || {}).innerText?.trim();

                if (!title || title.includes(': em leilão')) {
                    // Try to get text from h1 rejecting the status part
                    const h1 = document.querySelector('h1');
                    if (h1) {
                        // Clone to remove children if needed, or just regex
                        title = h1.innerText.replace(/: em leilão/gi, '').trim();
                    }
                }

                if (!title || title.length < 3) {
                    title = document.title.split('-')[0].trim();
                }

                if (!title) return null;

                // Photos from carousel
                let photos = [];
                const imgEls = document.querySelectorAll('.carousel-inner img, #galeria img, .slick-slide:not(.slick-cloned) img, .lote-imagens img');
                imgEls.forEach(img => {
                    const src = img.src || img.getAttribute('data-src');
                    if (src && !src.includes('logo_indisponivel') && !src.includes('LogosClientes')) {
                        photos.push(src);
                    }
                });

                // Price
                const priceEl = document.querySelector('.lote-valor-atual, .valor-lote, #lanceAtual');
                let valor = 0;
                if (priceEl) {
                    const priceText = priceEl.innerText.replace(/[^0-9,.]/g, '');
                    valor = parseFloat(priceText.replace(/\./g, '').replace(',', '.')) || 0;
                }

                // Metadata
                const registro = window.location.href.split('loteNumero=').pop() || window.location.href.split('/').pop();

                // Year
                const yearMatch = title.match(/\b(19[89]\d|20[0-2]\d)\b/);

                return {
                    registro,
                    site: siteDomain,
                    veiculo: title.toUpperCase(),
                    link: window.location.href,
                    fotos: photos,
                    valor,
                    ano: yearMatch ? parseInt(yearMatch[1]) : null,
                    localLeilao: 'Freitas Leiloeiro',
                    modalidade: 'leilao',
                    tipo: 'veiculo'
                };
            }, SITE);

            return data;
        } catch (e) {
            console.error(`   ❌ [${SITE}] Erro ao raspar lote ${url}: ${e.message}`);
            return null;
        }
    };

    const crawlAuction = async (browser, link) => {
        console.log(`📋 [${SITE}] Capturando leilão: ${link}`);
        const page = await browser.newPage();
        const results = [];
        try {
            await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36');

            let currentUrl = link;
            let pageNum = 1;
            while (currentUrl && pageNum <= 20) {
                await page.goto(currentUrl, { waitUntil: 'networkidle2', timeout: TIMEOUT });
                // Check if list is empty or blocked
                try {
                    await page.waitForSelector('.cardlote', { timeout: 15000 });
                } catch (e) {
                    console.log(`   ⚠️ [${SITE}] No cards found on page ${pageNum}.`);
                    break;
                }

                const links = await extractLinksFromPage(page);

                // Process each lot link
                for (const lotUrl of links) {
                    const vehicle = await scrapeLotPage(page, lotUrl);
                    if (vehicle) {
                        const filtered = filterVehicles([vehicle]);
                        results.push(...filtered);
                    }
                    // Small delay between lots
                    await new Promise(r => setTimeout(r, 1000));
                    // Go back to list if needed? No, scrapeLotPage navigates.
                    // Wait, using same page object for navigation within loop is tricky if we need to go back.
                    // Better to open new page or go back. 
                    // Refactoring: Use a separate page for details or go back.
                }

                if (results.length > 0) {
                    console.log(`   ✅ [${SITE}] Pág ${pageNum}: ${links.length} links, ${results.length} veículos coletados.`);
                }

                // We need to be on the list page again to find next link
                await page.goto(currentUrl, { waitUntil: 'networkidle2' });

                // Check for next page
                const nextLink = await page.evaluate(() => {
                    const next = Array.from(document.querySelectorAll('.pagination a')).find(a =>
                        a.innerText.includes('Próximo') || a.innerText.includes('>>') || a.innerText.includes('›')
                    );
                    return next ? next.href : null;
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
        console.log(`🚀 [${SITE}] Iniciando captura de veículos...`);

        const browser = await puppeteer.launch({
            executablePath: getExecutablePath(),
            headless: true,
            protocolTimeout: 240000,
            args: getCommonArgs()
        });

        const listaTotal = [];
        const seenIds = new Set();
        try {
            const page = await browser.newPage();
            await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36');

            // STRATEGY 1: Use vehicle category search (Categoria=1 = Veículos)
            console.log(`🔍 [${SITE}] Buscando leilões de veículos (Categoria=1)...`);
            await page.goto(`${BASE_URL}/Leiloes/PesquisarLotes?Categoria=1`, { waitUntil: 'networkidle2', timeout: TIMEOUT });

            // Discover auction links
            const auctionLinks = await page.evaluate(() => {
                const links = new Set();
                document.querySelectorAll('a[href*="Leilao="]').forEach(a => {
                    const m = a.href.match(/Leilao=(\d+)/);
                    if (m) links.add(`https://www.freitasleiloeiro.com.br/Leiloes/PesquisarLotes?Leilao=${m[1]}&Categoria=1`);
                });
                return [...links];
            });

            console.log(`✅ [${SITE}] ${auctionLinks.length} leilões detectados.`);
            await page.close();

            if (auctionLinks.length > 0) {
                // STRATEGY 2: Process each auction in parallel
                for (let i = 0; i < auctionLinks.length; i += CONCURRENCY) {
                    const chunk = auctionLinks.slice(i, i + CONCURRENCY);
                    const chunkResults = await Promise.all(chunk.map(link => crawlAuction(browser, link)));

                    const flattened = chunkResults.flat().filter(v => {
                        if (seenIds.has(v.registro)) return false;
                        seenIds.add(v.registro);
                        return true;
                    });

                    if (flattened.length > 0) {
                        await salvarLista(flattened);
                        listaTotal.push(...flattened);
                    }
                    console.log(`   🔸 [${SITE}] Lote ${Math.floor(i / CONCURRENCY) + 1}/${Math.ceil(auctionLinks.length / CONCURRENCY)}. Total: ${listaTotal.length} veículos.`);
                }
            } else {
                // FALLBACK: Simple pagination through search
                console.log(`⚠️ [${SITE}] Nenhum leilão detectado. Usando busca paginada...`);
                const fallbackPage = await browser.newPage();
                await fallbackPage.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');

                for (let p = 1; p <= 100; p++) {
                    try {
                        const url = `${BASE_URL}/Leiloes/PesquisarLotes?Categoria=1&PageNumber=${p}`;
                        await fallbackPage.goto(url, { waitUntil: 'networkidle2', timeout: TIMEOUT });
                        await fallbackPage.waitForSelector('.cardlote', { timeout: 15000 }).catch(() => null);
                        await new Promise(r => setTimeout(r, 1500));

                        const links = await extractLinksFromPage(fallbackPage);
                        if (links.length === 0) break;

                        for (const lotUrl of links) {
                            const vehicle = await scrapeLotPage(fallbackPage, lotUrl);
                            if (vehicle) {
                                const filtered = filterVehicles([vehicle]);
                                if (filtered.length > 0) {
                                    await salvarLista(filtered);
                                    listaTotal.push(...filtered);
                                }
                            }
                            await new Promise(r => setTimeout(r, 1000));
                        }

                        console.log(`   ✅ [${SITE}] Página ${p}: +${links.length} processados. Total: ${listaTotal.length}`);
                    } catch (e) {
                        console.log(`   ⚠️ [${SITE}] Erro página ${p}: ${e.message}`);
                        break;
                    }
                }
                await fallbackPage.close();
            }

        } catch (error) {
            console.error(`❌ [${SITE}] Erro:`, error.message);
        } finally {
            await browser.close();
        }
        console.log(`✅ [${SITE}] Sucesso! ${listaTotal.length} veículos coletados.`);
        return listaTotal.length;
    };

    return { buscarTodos, SITE };
};

/**
 * Filter to only vehicles - following Sodré Santoro reference pattern
 */
function filterVehicles(items) {
    return items.filter(v => {
        const text = v.veiculo.toUpperCase();

        const blacklist = [
            'MOVEIS', 'ELETRO', 'INFORMÁTICA', 'SUCATA DE FERRO', 'TELEVISAO', 'CELULAR',
            'CADEIRA', 'MESA', 'ARMARIO', 'GELADEIRA', 'FOGAO', 'MACBOOK', 'IPHONE', 'NOTEBOOK',
            'MONITOR', 'BEBEDOURO', 'SOFA', 'ROUPAS', 'CALCADOS', 'BOLSAS', 'BRINQUEDOS',
            'IMOVEL', 'IMOVEIS', 'CASA', 'APARTAMENTO', 'APTO', 'TERRENO', 'SITIO', 'FAZENDA', 'GALPAO',
            'MATERIAL', 'FERRAGENS', 'SUCATA DE BENS', 'ESCRITORIO', 'EQUIPAMENTO', 'PEÇAS',
            'LOTE DE', 'MADEIRA', 'QUADRO', 'ESTANTE', 'VAGA', 'GARAGEM'
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

        if (isBlacklisted && !hasBrand) return false;

        return true;
    });
}

export const execute = async (db) => {
    const crawler = createCrawler(db);
    return await crawler.buscarTodos();
};

export default createCrawler;
