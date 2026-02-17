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
            const cards = document.querySelectorAll('.cardlote, .cardLote, .lote-item');

            cards.forEach(card => {
                const linkEl = card.querySelector('a');
                const titleEl = card.querySelector('.cardLote-descVeic, .lote-header h1, h1, .titulo-lote');
                if (!linkEl || !titleEl) return;

                const title = titleEl.innerText.trim();
                if (!title || title.length < 3) return;

                const url = linkEl.href;
                const registro = card.querySelector('.cardLote-lote')?.innerText.replace('Lote:', '').trim() || url.split('=').pop() || url.split('/').pop();

                // ===== IMAGE EXTRACTION =====
                let imgSrc = '';
                const cardImg = card.querySelector('img[src*="LeiloesLotes"], img[src*="cdn"], .cardLote-img img');
                if (cardImg) {
                    imgSrc = cardImg.src || cardImg.getAttribute('data-src');
                }
                if (!imgSrc) {
                    const divImg = card.querySelector('.cardLote-img');
                    if (divImg) {
                        const style = divImg.getAttribute('style') || '';
                        const bgMatch = style.match(/background-image\s*:\s*url\(['"]?([^'")\s]+)['"]?\)/i);
                        if (bgMatch) imgSrc = bgMatch[1];
                    }
                }
                if (imgSrc && (imgSrc.includes('data:image') || imgSrc.includes('placeholder') || imgSrc.includes('no-image'))) {
                    imgSrc = '';
                }
                if (imgSrc && !imgSrc.startsWith('http')) {
                    imgSrc = imgSrc.startsWith('/') ? `https://www.freitasleiloeiro.com.br${imgSrc}` : `https://www.freitasleiloeiro.com.br/${imgSrc}`;
                }

                // ===== PRICE =====
                const priceEl = card.querySelector('.cardLote-vlr, .vlr-lance');
                let valor = 0;
                if (priceEl) {
                    const priceText = priceEl.innerText.replace(/[^0-9,.]/g, '');
                    valor = parseFloat(priceText.replace(/\./g, '').replace(',', '.')) || 0;
                }

                // ===== CATEGORY DETECTION =====
                const text = title.toUpperCase();
                let tipo = 'veiculo';
                const imovelKeywords = ['CASA', 'APARTAMENTO', 'APTO', 'TERRENO', 'SITIO', 'FAZENDA', 'GALPAO', 'IMOVEL', 'PRÉDIO', 'VAGA'];
                if (imovelKeywords.some(k => text.includes(k))) {
                    tipo = 'imovel';
                } else {
                    const diversosKeywords = ['MOVEIS', 'ELETRO', 'INFORMÁTICA', 'SUCATA DE FERRO', 'TELEVISAO', 'CELULAR', 'MACBOOK', 'IPHONE', 'NOTEBOOK', 'MONITOR', 'BEBEDOURO', 'MATERIAL', 'FERRAGENS', 'LOTE DE'];
                    if (diversosKeywords.some(k => text.includes(k))) {
                        tipo = 'diversos';
                    }
                }

                const yearMatch = title.match(/\b(19[89]\d|20[0-2]\d)\b/);
                const isBlindado = title.includes('BLIND') || title.includes('BLIN');
                const locEl = card.querySelector('.cardLote-local, .local, .patio');
                const localLeilao = locEl ? locEl.innerText.trim() : 'SP';

                found.push({
                    registro,
                    site: siteDomain,
                    veiculo: title.toUpperCase(),
                    link: url,
                    fotos: imgSrc ? [imgSrc] : [],
                    valor,
                    ano: yearMatch ? parseInt(yearMatch[1]) : null,
                    localLeilao: localLeilao,
                    modalidade: 'leilao',
                    tipo: tipo,
                    blindado: isBlindado
                });
            });
            return found;
        }, site);
    };

    const extractLinksFromPage = async (page) => {
        return await page.evaluate(() => {
            const links = new Set();
            document.querySelectorAll('a[href*="Lote="], .cardlote a').forEach(a => {
                if (a.href) links.add(a.href);
            });
            return Array.from(links);
        });
    };

    const scrapeLotPage = async (page, url) => {
        try {
            let lotLoaded = false;
            for (let i = 0; i < 3; i++) {
                try {
                    await page.goto(url, { waitUntil: 'networkidle2', timeout: TIMEOUT });
                    await Promise.race([
                        page.waitForSelector('.cardLote-descVeic', { timeout: 10000 }),
                        page.waitForSelector('h1', { timeout: 10000 }),
                        page.waitForSelector('.detalhe-lote', { timeout: 10000 })
                    ]);
                    lotLoaded = true;
                    break;
                } catch (e) {
                    console.log(`      ⚠️ [${SITE}] Retrying... ${url}`);
                    await new Promise(r => setTimeout(r, 2000));
                }
            }
            if (!lotLoaded) return null;

            const data = await page.evaluate((siteDomain) => {
                const title = (document.querySelector('h1') || document.querySelector('.cardLote-descVeic') || {}).innerText?.trim();
                if (!title) return null;

                let photos = [];
                const imgSelectors = '.carousel-inner img, #galeria img, .slick-slide img, .lote-imagens img, img[src*="LeiloesLotes"], img[src*="cdn"]';
                document.querySelectorAll(imgSelectors).forEach(img => {
                    const src = img.src || img.getAttribute('data-src') || img.getAttribute('data-lazy');
                    if (src && !src.includes('logo_indisponivel') && !src.includes('LogosClientes') && !src.includes('data:image')) {
                        if (!photos.includes(src)) photos.push(src);
                    }
                });

                const priceEl = document.querySelector('.lote-valor-atual, .valor-lote, #lanceAtual, .cardLote-vlr');
                let valor = 0;
                if (priceEl) {
                    const priceText = priceEl.innerText.replace(/[^0-9,.]/g, '');
                    valor = parseFloat(priceText.replace(/\./g, '').replace(',', '.')) || 0;
                }

                const details = {};
                document.querySelectorAll('li, div, p').forEach(el => {
                    const text = el.innerText;
                    if (text.includes(':')) {
                        const [key, ...val] = text.split(':');
                        details[key.trim().toLowerCase()] = val.join(':').trim();
                    }
                });

                const text = title.toUpperCase();
                let tipo = 'veiculo';
                const imovelKeywords = ['CASA', 'APARTAMENTO', 'APTO', 'TERRENO', 'SITIO', 'FAZENDA', 'GALPAO', 'IMOVEL', 'PRÉDIO', 'VAGA'];
                if (imovelKeywords.some(k => text.includes(k))) tipo = 'imovel';
                else {
                    const diversosKeywords = ['MOVEIS', 'ELETRO', 'INFORMÁTICA', 'SUCATA DE FERRO', 'TELEVISAO', 'CELULAR', 'MACBOOK', 'IPHONE', 'NOTEBOOK', 'MONITOR', 'BEBEDOURO', 'MATERIAL', 'FERRAGENS', 'LOTE DE'];
                    if (diversosKeywords.some(k => text.includes(k))) tipo = 'diversos';
                }

                const anoParts = (details['ano'] || details['ano/mod'] || '').split('/');
                const anoMod = anoParts[1] ? parseInt(anoParts[1]) : (anoParts[0] ? parseInt(anoParts[0]) : null);

                const condicao = details['condição'] || details['estado'] || details['classificação'] || '';
                const cor = details['cor'] || '';
                const combustivel = details['combustível'] || '';
                const blindado = title.includes('BLIND') || document.body.innerText.includes('BLINDADO');

                const kmStr = details['km'] || details['quilometragem'] || '';
                const km = kmStr ? parseInt(kmStr.replace(/[^0-9]/g, '')) : null;
                const cambio = details['câmbio'] || details['cambio'] || '';

                return {
                    registro: window.location.href.split('Lote=').pop() || window.location.href.split('/').pop(),
                    site: siteDomain,
                    veiculo: title.toUpperCase(),
                    link: window.location.href,
                    fotos: photos,
                    valor,
                    ano: anoMod || (title.match(/\b(19[89]\d|20[0-2]\d)\b/)?.[1] ? parseInt(title.match(/\b(19[89]\d|20[0-2]\d)\b/)[1]) : null),
                    localLeilao: details['pátio'] || details['local'] || 'Freitas Leiloeiro',
                    modalidade: 'leilao',
                    tipo: tipo,
                    condicao,
                    cor,
                    combustivel,
                    blindado,
                    km,
                    cambio
                };
            }, SITE);

            return data;
        } catch (e) {
            console.error(`   ❌ [${SITE}] Error scraping lot: ${url}`, e.message);
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
                try {
                    await page.waitForSelector('.cardlote', { timeout: 15000 });
                } catch (e) {
                    console.log(`   ⚠️ [${SITE}] No cards found on page ${pageNum}.`);
                    break;
                }

                const links = await extractLinksFromPage(page);
                for (const lotUrl of links) {
                    const item = await scrapeLotPage(page, lotUrl);
                    if (item) results.push(item);
                    await new Promise(r => setTimeout(r, 1000));
                }

                if (results.length > 0) {
                    console.log(`   ✅ [${SITE}] Pág ${pageNum}: ${links.length} links, ${results.length} itens coletados.`);
                }

                await page.goto(currentUrl, { waitUntil: 'networkidle2' });
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
        console.log(`🚀 [${SITE}] Iniciando captura global...`);

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

            // Categorias: 1 = Veiculos, 2 = Imoveis, 4 = Materiais/Diversos
            const categories = [1, 2, 4];
            for (const catId of categories) {
                console.log(`🔍 [${SITE}] Buscando categoria ${catId}...`);
                await page.goto(`${BASE_URL}/Leiloes/PesquisarLotes?Categoria=${catId}`, { waitUntil: 'networkidle2', timeout: TIMEOUT });

                const auctionLinks = await page.evaluate(() => {
                    const ids = new Set();
                    document.querySelectorAll('a[href*="Leilao="]').forEach(a => {
                        const m = a.href.match(/Leilao=(\d+)/);
                        if (m) ids.add(m[1]);
                    });
                    document.querySelectorAll('a[href*="leilaoId="]').forEach(a => {
                        const m = a.href.match(/leilaoId=(\d+)/);
                        if (m) ids.add(m[1]);
                    });
                    return [...ids].map(id => `https://www.freitasleiloeiro.com.br/Leiloes/PesquisarLotes?Leilao=${id}`);
                });

                console.log(`✅ [${SITE}] ${auctionLinks.length} leilões detectados na categoria ${catId}.`);

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
                    console.log(`   🔸 [${SITE}] Lote ${Math.floor(i / CONCURRENCY) + 1}/${Math.ceil(auctionLinks.length / CONCURRENCY)}. Total: ${listaTotal.length} itens.`);
                }
            }

        } catch (error) {
            console.error(`❌ [${SITE}] Erro:`, error.message);
        } finally {
            await browser.close();
        }
        console.log(`✅ [${SITE}] Sucesso! ${listaTotal.length} itens coletados.`);
        return listaTotal.length;
    };

    return { buscarTodos, SITE };
};

export const execute = async (db) => {
    const crawler = createCrawler(db);
    return await crawler.buscarTodos();
};

export default createCrawler;


