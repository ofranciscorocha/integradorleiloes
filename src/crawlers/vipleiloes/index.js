import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import dotenv from 'dotenv';
import { getExecutablePath, getCommonArgs } from '../../utils/browser.js';
import { parseVehicleDetails } from '../../utils/vehicle-parser.js';

dotenv.config();
puppeteer.use(StealthPlugin());

const TIMEOUT = parseInt(process.env.CRAWLER_TIMEOUT_MS) || 90000;

const createCrawler = (db) => {
    const { salvarLista } = db;
    const SITE = 'vipleiloes.com.br';
    const BASE_URL = 'https://www.vipleiloes.com.br';

    const extractFromPage = async (page) => {
        return await page.evaluate((site, base) => {
            const items = [];
            // Try Desktop selectors first
            let cards = document.querySelectorAll('div.itm-card');
            let isMobile = false;

            if (cards.length === 0) {
                // Try Mobile selectors
                cards = document.querySelectorAll('.card-anuncio');
                if (cards.length > 0) isMobile = true;
            }

            cards.forEach(card => {
                try {
                    let linkUrl = '', veiculo = '', lote = '', local = '', precoText = '', imgUrl = '';

                    if (isMobile) {
                        // Mobile Logic
                        const linkEl = card.querySelector('a.anc-body') || card.querySelector('.crd-image a');
                        linkUrl = linkEl ? linkEl.href : '';

                        const nameEl = card.querySelector('.anc-title h1');
                        veiculo = nameEl ? nameEl.textContent.trim().toUpperCase() : '';

                        const strongs = Array.from(card.querySelectorAll('strong'));
                        const loteStrong = strongs.find(s => s.innerText.includes('Lote'));
                        lote = loteStrong ? loteStrong.nextSibling.textContent.trim() : '';

                        const localStrong = strongs.find(s => s.innerText.includes('Local'));
                        local = localStrong ? localStrong.nextSibling.textContent.trim() : '';

                        const priceEl = card.querySelector('.valor-atual');
                        precoText = priceEl ? priceEl.innerText.replace(/[^0-9,]/g, '').replace(',', '.') : '0';

                        const imgEl = card.querySelector('.crd-image img');
                        imgUrl = imgEl ? (imgEl.getAttribute('src') || '') : '';

                    } else {
                        // Desktop Logic
                        const linkEl = card.querySelector('a.itm-cdlink');
                        if (!linkEl) return;
                        linkUrl = linkEl.getAttribute('href') || '';

                        const body = card.querySelector('div.itm-body');
                        const firstline = body ? body.querySelectorAll('div.itm-firstline p.itm-info') : [];

                        firstline.forEach(p => {
                            const text = p.textContent;
                            if (text.includes('Lote:')) lote = text.split(':')[1]?.trim() || '';
                            if (text.includes('Local:')) local = text.split(':')[1]?.trim() || '';
                        });

                        const nameEl = body ? body.querySelector('h4.itm-name') : null;
                        veiculo = nameEl ? nameEl.textContent.replace(/\n/g, ' ').trim().toUpperCase() : '';

                        const priceEl = card.querySelector('.itm-price-val');
                        precoText = priceEl ? priceEl.textContent.replace(/[^0-9,]/g, '').replace(',', '.') : '0';

                        const imgEl = card.querySelector('.itm-img, img');
                        if (imgEl) {
                            imgUrl = imgEl.getAttribute('src') || imgEl.getAttribute('data-src') || imgEl.getAttribute('data-lazy') || '';
                        }
                    }

                    // Normalize URL
                    if (linkUrl && !linkUrl.startsWith('http')) {
                        if (base.endsWith('/') && linkUrl.startsWith('/')) linkUrl = base + linkUrl.substring(1);
                        else if (!base.endsWith('/') && !linkUrl.startsWith('/')) linkUrl = base + '/' + linkUrl;
                        else linkUrl = base + linkUrl;
                    }

                    const registro = linkUrl.split('/').pop();

                    // Categorization
                    let tipo = 'veiculo';
                    const vUpper = veiculo;
                    if (vUpper.includes('CASA') || vUpper.includes('APARTAMENTO') || vUpper.includes('TERRENO') || vUpper.includes('IMÓVEL') || vUpper.includes('IMOVEL') || vUpper.includes('GALPÃO') || vUpper.includes('SÍTIO') || vUpper.includes('CHÁCARA')) {
                        tipo = 'imovel';
                    } else if (vUpper.includes('SUCATA') || vUpper.includes('PEÇAS') || vUpper.includes('DIVERSOS') || vUpper.includes('LOTE') || vUpper.includes('MÓVEIS') || vUpper.includes('ELETRO')) {
                        tipo = 'diversos';
                    }

                    if (veiculo) {
                        items.push({
                            site,
                            registro, // ad_id
                            link: linkUrl,
                            veiculo, // titulo
                            fotos: [imgUrl],
                            valor: parseFloat(precoText) || 0,
                            localLeilao: local || 'Brasil',
                            lote,
                            modalidade: 'leilao',
                            tipo
                        });
                    }
                } catch (e) { }
            });
            return items;
        }, SITE, BASE_URL);
    };

    const buscarTodos = async () => {
        console.log(`🚀 [${SITE}] SUPERCRAWLER PUPPETEER (Optimized): Iniciando captura...`);

        const browser = await puppeteer.launch({
            executablePath: getExecutablePath(),
            headless: true,
            args: getCommonArgs()
        });

        let totalCapturados = 0;
        const seenIds = new Set();

        try {
            const page = await browser.newPage();
            // Block heavy resources
            await page.setRequestInterception(true);
            page.on('request', (req) => {
                const type = req.resourceType();
                if (['image', 'stylesheet', 'font', 'media'].includes(type)) req.abort();
                else req.continue();
            });

            await page.setUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 15_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.0 Mobile/15E148 Safari/604.1');
            await page.setViewport({ width: 375, height: 667, isMobile: true, hasTouch: true });

            // Categories: 3=Automóveis, 4=Caminhões, 5=Motos, 37=Utilitários, Imóveis?
            const categorias = [3, 4, 5, 37];

            for (const cat of categorias) {
                let pagina = 1;
                let hasMore = true;

                console.log(`\n📂 [${SITE}] Categoria ${cat}...`);

                while (hasMore && pagina <= 30) {
                    const url = `${BASE_URL}/pesquisa?Pagina=${pagina}&Categorias=${cat}&OrdenacaoVeiculo=InicioLeilao`;

                    try {
                        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: TIMEOUT });
                        await page.waitForSelector('div.itm-card', { timeout: 10000 }).catch(() => null);

                        const items = await extractFromPage(page);

                        if (items.length === 0) {
                            console.log(`   🔸 [${SITE}] Cat ${cat} pág ${pagina}: Sem itens.`);
                            const html = await page.content();
                            console.log(`      DEBUG: HTML length: ${html.length}`);
                            console.log(`      DEBUG: Title: ${await page.title()}`);
                            // console.log(`      DEBUG: HTML Snippet: ${html.substring(0, 500)}`);
                            hasMore = false;
                            continue;
                        }

                        const newItems = items.filter(item => {
                            if (seenIds.has(item.registro)) return false;
                            seenIds.add(item.registro);
                            return true;
                        }).map(item => {
                            const details = parseVehicleDetails(item.veiculo);
                            return {
                                ...item,
                                ano: details.ano,
                                condicao: details.condicao,
                                combustivel: details.combustivel,
                                km: details.km,
                                cor: details.cor,
                                cambio: details.cambio,
                                blindado: details.blindado
                            };
                        });

                        if (newItems.length > 0) {
                            await salvarLista(newItems);
                            totalCapturados += newItems.length;
                            console.log(`   ✅ [${SITE}] Pág ${pagina}: +${newItems.length} itens.`);
                        }

                        const totalText = await page.evaluate(() => {
                            const h4 = document.querySelector('div.col-md-12.tituloListagem h4');
                            return h4 ? h4.textContent.replace(/[^\d]/g, '') : '0';
                        });
                        const total = parseInt(totalText) || 0;
                        const totalPaginas = Math.ceil(total / 12);

                        if (pagina >= totalPaginas) hasMore = false;
                        else pagina++;

                    } catch (e) {
                        console.log(`   ⚠️ [${SITE}] Erro: ${e.message}`);
                        hasMore = false;
                    }
                }
            }

            console.log(`✅ [${SITE}] Finalizado! ${totalCapturados} itens coletados.`);
            return totalCapturados;

        } catch (e) {
            console.error(`❌ [${SITE}] Erro:`, e.message);
            return 0;
        } finally {
            await browser.close();
        }
    };

    return { buscarTodos, SITE };
};

export default createCrawler;
