import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import dotenv from 'dotenv';
import { getExecutablePath, getCommonArgs, getRandomUserAgent } from '../../utils/browser.js';

dotenv.config();
puppeteer.use(StealthPlugin());
import { standardizeStatus } from '../../utils/status.js';
import { classifyVehicle, parseVehicleDetails, cleanTitle } from '../../utils/vehicle-parser.js';

const TIMEOUT = parseInt(process.env.CRAWLER_TIMEOUT_MS) || 60000;
const CONCURRENCY = 3;

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
                // Target the specific vehicle description div
                const titleEl = card.querySelector('.cardLote-descVeic, .lote-header h1, h1, .titulo-lote');
                if (!linkEl || !titleEl) return;

                let title = titleEl.innerText.trim();

                // CRITICAL: Filter out auction headers or generic titles
                if (!title || title.length < 5 || title.includes('LEILÃO') || title.includes('PRÓXIMO')) {
                    const descSpan = card.querySelector('.cardLote-descVeic span') || card.querySelector('.cardLote-descVeic');
                    if (descSpan) title = descSpan.innerText.trim();
                }

                // If it STILL looks like an auction title, it's not a lot card we want here
                if (!title || title.length < 5 || title.includes('1º LEILÃO')) return;

                const url = linkEl.href;
                if (!url.includes('leilaoId=') && !url.includes('Lote=') && !url.includes('loteNumero=')) return;

                // UNIQUE REGISTRO: auctionId + lotNumber
                // Using URL parameters for uniqueness
                try {
                    const urlObj = new URL(url);
                    const leilaoId = urlObj.searchParams.get('leilaoId') || urlObj.searchParams.get('Leilao') || '0';
                    const loteNum = urlObj.searchParams.get('loteNumero') || urlObj.searchParams.get('Lote') || url.split('=').pop();
                    const registro = `${leilaoId}_${loteNum}`;

                    // ===== IMAGE EXTRACTION =====
                    let imgSrc = '';
                    const cardImg = card.querySelector('img.cardLote-img, img[src*="/FOTOS/"], img[src*="LeiloesLotes"], img[data-src*="/FOTOS/"]');
                    if (cardImg) {
                        const src = cardImg.getAttribute('data-src') || cardImg.getAttribute('data-original') || cardImg.src || '';
                        if (src && !src.includes('LogosClientes') && !src.includes('Assets') && !src.includes('logo') && !src.includes('transparent.gif')) {
                            imgSrc = src;
                        }
                    }

                    if (!imgSrc) {
                        const imgs = Array.from(card.querySelectorAll('img'));
                        const validImg = imgs.find(img => {
                            const src = img.getAttribute('data-src') || img.getAttribute('data-original') || img.src || '';
                            return src.includes('http') &&
                                !src.includes('logo') &&
                                !src.includes('Assets') &&
                                !src.includes('loader') &&
                                !src.includes('transparent.gif') &&
                                (src.includes('FOTOS') || src.includes('cardLote-img') || src.includes('LeiloesLotes'));
                        });
                        if (validImg) imgSrc = validImg.getAttribute('data-src') || validImg.getAttribute('data-original') || validImg.src;
                    }

                    if (imgSrc && imgSrc.startsWith('/')) {
                        imgSrc = 'https://www.freitasleiloeiro.com.br' + imgSrc;
                    }

                    // ===== PRICE =====
                    const priceEl = card.querySelector('.cardLote-vlr, .vlr-lance, .lance-atual');
                    let valor = 0;
                    if (priceEl) {
                        const priceText = priceEl.innerText.replace(/[^0-9,.]/g, '');
                        valor = parseFloat(priceText.replace(/\./g, '').replace(',', '.')) || 0;
                    }

                    const text = title.toUpperCase();
                    let tipo = 'veiculo';
                    if (['CASA', 'APTO', 'TERRENO', 'IMOVEL', 'FAZENDA'].some(k => text.includes(k))) tipo = 'imovel';
                    else if (['SUCATA', 'LOTE DE', 'MOVEIS', 'MÁQUINA'].some(k => text.includes(k))) tipo = 'diversos';

                    if (!imgSrc) return; // REQUIREMENT: Skip if no photo in preview

                    found.push({
                        registro: registro,
                        site: siteDomain,
                        veiculo: title.toUpperCase(),
                        link: url,
                        fotos: [imgSrc],
                        valor,
                        ano: parseInt(title.match(/\b(19|20)\d{2}\b/)?.[0]) || null,
                        localLeilao: card.querySelector('.cardLote-details')?.innerText.trim() || 'SP',
                        modalidade: 'leilao',
                        tipo: classifyVehicle(title),
                        situacao: 'Disponível'
                    });
                } catch (e) { }
            });
            return found;
        }, site);
    };

    const discoverAuctionsFromAgenda = async (page) => {
        console.log(`🔍 [${SITE}] Descobrindo leilões pela AGENDA...`);
        const agendaUrl = `${BASE_URL}/Leiloes/Agenda`;
        const auctionIds = new Set();
        try {
            await page.goto(agendaUrl, { waitUntil: 'domcontentloaded', timeout: TIMEOUT });
            await autoScroll(page);

            const ids = await page.evaluate(() => {
                const results = new Set();
                document.querySelectorAll('a[href*="Leilao="]').forEach(a => {
                    const match = a.href.match(/[Ll]eilao=(\d+)/);
                    if (match) results.add(match[1]);
                });
                return Array.from(results);
            });
            ids.forEach(id => auctionIds.add(id));
            console.log(`   ✅ [${SITE}] Agenda: ${ids.length} leilões detectados.`);
        } catch (e) {
            console.error(`   ⚠️ [${SITE}] Erro ao ler Agenda: ${e.message}`);
        }
        return auctionIds;
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
                        page.waitForSelector('.detalhe-lote', { timeout: 10000 }),
                        page.waitForSelector('.card-body', { timeout: 10000 }),
                        page.waitForSelector('.boxImgLoteItem', { timeout: 10000 })
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
                let title = (document.querySelector('h1') || document.querySelector('.cardLote-descVeic') || {}).innerText?.trim();

                // Fallback for title if H1 is not found or is generic
                if (!title || title.includes('Carro à venda')) {
                    const descElement = document.querySelector('.card-body div[style*="text-align:justify"]');
                    if (descElement) {
                        title = descElement.innerText.trim();
                    }
                }

                if (!title) return null;

                let photos = [];
                // Target the specific container for lot images - Detailed page
                const galleryImgs = document.querySelectorAll('.boxImgLoteItem img, .carousel-inner img, #galeria img');
                galleryImgs.forEach(img => {
                    const src = img.getAttribute('data-src') || img.getAttribute('data-original') || img.getAttribute('data-zoom') || img.src;
                    if (src && !src.includes('logo') && !src.includes('indisponivel') && !src.includes('transparent.gif') && !src.includes('data:image')) {
                        let fullUrl = src;
                        if (fullUrl.startsWith('/')) fullUrl = 'https://www.freitasleiloeiro.com.br' + fullUrl;
                        if (!photos.includes(fullUrl)) photos.push(fullUrl);
                    }
                });

                // If it fails, try the older gallery links
                if (photos.length === 0) {
                    const galleryLinks = document.querySelectorAll('.boxImgLoteItem a');
                    galleryLinks.forEach(a => {
                        let href = a.getAttribute('href');
                        if (href && !href.includes('javascript') && !photos.includes(href)) {
                            if (href.startsWith('/')) href = 'https://www.freitasleiloeiro.com.br' + href;
                            photos.push(href);
                        }
                    });
                }

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

                const statusRaw = details['status'] || details['situação'] || details['estado'] || '';
                const situacao = statusRaw || (document.querySelector('.lance-encerrado') ? 'Encerrado' : 'Disponível');

                // Ninja Standards: Data/Hora for Countdown
                let dataLeilaoISO = null;
                const dtText = document.querySelector('.detalhe-leilao-info, .cardLote-details')?.innerText || '';
                if (dtText) {
                    // Try to find "DD/MM/YYYY HH:MM"
                    const match = dtText.match(/(\d{2})\/(\d{2})\/(\d{4})\s+(?:às\s+)?(\d{2}):(\d{2})/);
                    if (match) {
                        dataLeilaoISO = `${match[3]}-${match[2]}-${match[1]}T${match[4]}:${match[5]}:00`;
                    }
                }

                const parsed = parseVehicleDetails(title + ' ' + (document.querySelector('.detalhe-veiculo-info')?.innerText || ''), details);

                // Attachments
                const attachments = [];
                document.querySelectorAll('a[href*=".pdf"], .btn-edital, a[text*="Edital"]').forEach(a => {
                    const href = a.href || a.getAttribute('data-url');
                    const text = a.innerText.trim() || 'Edital/Documento';
                    if (href && !attachments.find(at => at.url === href)) {
                        attachments.push({ name: text, url: href });
                    }
                });

                return {
                    registro: window.location.href.split('Lote=').pop() || window.location.href.split('/').pop(),
                    site: siteDomain,
                    veiculo: cleanTitle(title),
                    link: window.location.href,
                    fotos: photos,
                    valor,
                    ano: parsed.ano,
                    localLeilao: details['pátio'] || details['local'] || 'Freitas Leiloeiro',
                    modalidade: 'leilao',
                    tipo: classifyVehicle(title),
                    condicao: parsed.condicao || details['condição'] || details['estado'] || '',
                    cor: parsed.cor,
                    combustivel: parsed.combustivel,
                    blindado: parsed.blindado,
                    chave: parsed.chave,
                    km: parsed.km,
                    cambio: parsed.cambio,
                    dataLeilao: dataLeilaoISO,
                    situacaoRaw: situacao,

                    // NINJA ELITE DEEP FIELDS
                    localColisao: parsed.localColisao,
                    origem: parsed.origem,
                    comitente: parsed.comitente || details['comitente'] || details['vendedor'] || '',
                    debitoResponsabilidade: parsed.debitoResponsabilidade,
                    remarcado: parsed.remarcado,
                    anexos: attachments
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
            await page.setViewport({ width: 1366, height: 768 });
            await page.setUserAgent(getRandomUserAgent());

            await page.goto(link, { waitUntil: 'networkidle2', timeout: TIMEOUT });

            // --- LOAD MORE LOGIC ---
            let lastCount = 0;
            for (let i = 0; i < 100; i++) {
                const currentCount = await page.evaluate(() => document.querySelectorAll('.cardlote, .cardLote, .lote-item').length);
                await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));

                const btnClicked = await page.evaluate(() => {
                    const btn = Array.from(document.querySelectorAll('button, a, span, div'))
                        .find(el => {
                            const t = (el.innerText || '').toUpperCase();
                            return (t.includes('CARREGAR') || t.includes('MAIS') || t.includes('LOTES')) && el.offsetParent !== null;
                        });
                    if (btn) {
                        btn.click();
                        return true;
                    }
                    return false;
                });

                if (!btnClicked && i > 10 && currentCount === lastCount) break;
                lastCount = currentCount;
                await new Promise(r => setTimeout(r, 2000));
            }

            const links = await extractLinksFromPage(page);
            console.log(`   ✅ [${SITE}] Encontrados ${links.length} lotes no leilão.`);

            for (const lotUrl of links) {
                const item = await scrapeLotPage(page, lotUrl);
                if (item && item.fotos && item.fotos.length > 0) {
                    item.situacao = standardizeStatus(item.situacaoRaw);
                    delete item.situacaoRaw;
                    results.push(item);
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
        console.log(`🚀 [${SITE}] TURBO PUPPETEER MODE: Iniciando captura otimizada...`);

        const browser = await puppeteer.launch({
            executablePath: getExecutablePath(),
            headless: 'new',
            protocolTimeout: 300000,
            args: [...getCommonArgs(), '--disable-web-security']
        });

        const listaTotal = [];
        const seenIds = new Set();
        try {
            const page = await browser.newPage();

            // OPTIMIZATION: Block heavy assets
            await page.setRequestInterception(true);
            page.on('request', (req) => {
                const type = req.resourceType();
                if (['image', 'stylesheet', 'font', 'media'].includes(type) || req.url().includes('google-analytics')) {
                    req.abort();
                } else {
                    req.continue();
                }
            });

            await page.setViewport({ width: 1366, height: 768 });
            await page.setUserAgent(getRandomUserAgent());

            // Categories: 1 = Veiculos, 2 = Imoveis, 4 = Materiais/Diversos
            const categories = [1, 2, 3, 4, 5, 6, 7, 8];
            // Discover auction IDs
            const agendaIds = await discoverAuctionsFromAgenda(page);
            agendaIds.forEach(id => allAuctionIds.add(id));

            for (const catId of categories) {
                console.log(`🔍 [${SITE}] Explorando categoria ${catId}...`);
                try {
                    await page.goto(`${BASE_URL}/Leiloes/PesquisarLotes?Categoria=${catId}`, { waitUntil: 'domcontentloaded', timeout: TIMEOUT });

                    // Dica: Tentar clicar em filtros de veículos no topo se for categoria 1
                    if (catId === 1) {
                        try {
                            await page.evaluate(() => {
                                const veicFilter = Array.from(document.querySelectorAll('a, button')).find(el => el.innerText.includes('VEÍCULOS'));
                                if (veicFilter) veicFilter.click();
                            });
                            await new Promise(r => setTimeout(r, 2000));
                        } catch (e) { }
                    }

                    // --- ROBUST LOAD MORE ---
                    console.log(`   ⏳ [${SITE}] Expandindo lista da categoria ${catId}...`);
                    let lastCount = 0;
                    for (let i = 0; i < 300; i++) { // EVEN MORE AGGRESSIVE
                        const currentCount = await page.evaluate(() => document.querySelectorAll('.cardlote, .cardLote, .lote-item').length);

                        // Scroll to bottom
                        await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));

                        const btnClicked = await page.evaluate(() => {
                            const btns = Array.from(document.querySelectorAll('button, a, .btn'));
                            const loadBtn = btns.find(btn => {
                                const text = (btn.innerText || '').toUpperCase();
                                return (text.includes('CARREGAR') || text.includes('MAIS') || text.includes('LOAD MORE')) && btn.offsetParent !== null;
                            });
                            if (loadBtn) {
                                loadBtn.click();
                                return true;
                            }
                            return false;
                        });

                        if (!btnClicked && i > 15 && currentCount === lastCount) break;
                        lastCount = currentCount;
                        await new Promise(r => setTimeout(r, 1500));
                    }

                    const initialLots = await extractVehiclesFromPage(page, SITE);
                    if (initialLots.length > 0) {
                        const newLots = initialLots.filter(l => !seenIds.has(l.registro));
                        newLots.forEach(l => seenIds.add(l.registro));
                        if (newLots.length > 0) {
                            await salvarLista(newLots);
                            listaTotal.push(...newLots);
                            console.log(`   🔸 [${SITE}] +${newLots.length} lotes da categoria ${catId}.`);
                        }
                    }

                    // Discover auction IDs
                    const extractedIds = await page.evaluate(() => {
                        return Array.from(document.querySelectorAll('a[href*="Leilao="]')).map(a => {
                            const match = a.href.match(/[Ll]eilao=(\d+)/);
                            return match ? match[1] : null;
                        }).filter(id => id);
                    });
                    extractedIds.forEach(id => allAuctionIds.add(id));

                } catch (e) {
                    console.error(`   ⚠️ [${SITE}] Erro na categoria ${catId}: ${e.message}`);
                }
            }

            console.log(`✅ [${SITE}] Total de ${allAuctionIds.size} leilões únicos detectados.`);
            const auctionLinks = Array.from(allAuctionIds).map(id => `https://www.freitasleiloeiro.com.br/Leiloes/PesquisarLotes?Leilao=${id}`);

            // Process deep auctions
            for (const link of auctionLinks) {
                const pageResult = await crawlAuction(browser, link);
                const newItems = pageResult.filter(v => {
                    if (!v.registro || seenIds.has(v.registro)) return false;
                    seenIds.add(v.registro);
                    return true;
                });

                if (newItems.length > 0) {
                    await salvarLista(newItems);
                    listaTotal.push(...newItems);
                    console.log(`      ✅ [${SITE}] +${newItems.length} novos. Total: ${listaTotal.length}`);
                }
            }

        } catch (error) {
            console.error(`❌ [${SITE}] Erro Fatal no Freitas:`, error.message);
        } finally {
            await browser.close();
        }
        return listaTotal.length;
    };

    return { buscarTodos, SITE };
};

export const execute = async (db) => {
    const crawler = createCrawler(db);
    return await crawler.buscarTodos();
};

export default createCrawler;


