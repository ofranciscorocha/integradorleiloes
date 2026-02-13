import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import dotenv from 'dotenv';

dotenv.config();
puppeteer.use(StealthPlugin());

const TIMEOUT = parseInt(process.env.CRAWLER_TIMEOUT_MS) || 90000;
const WAIT_UNTIL = 'networkidle2'; // More reliable in production latency

/**
 * Trata string de data/hora para objeto com date e timestamp
 */
const tratarDataHora = (dataHoraStr) => {
    if (!dataHoraStr) return { string: '', time: null, date: null };
    const str = dataHoraStr.trim();
    const match = str.match(/(\d{1,2})\/(\d{1,2})\/(\d{2,4})(?:\s*(\d{1,2}):(\d{2}))?/);
    if (match) {
        let [, dia, mes, ano, hora, minuto] = match;
        if (ano.length === 2) ano = '20' + ano;
        hora = hora || '12';
        minuto = minuto || '00';
        const date = new Date(ano, mes - 1, dia, hora, minuto);
        return { string: str, time: date.getTime(), date };
    }
    return { string: str, time: null, date: null };
};

const createCrawler = (db) => {
    const { salvarLista } = db;
    const SITE = 'palaciodosleiloes.com.br';
    const BASE_URL = 'https://www.palaciodosleiloes.com.br';

    const listarLotes = async () => {
        console.log(`🚀 [${SITE}] Iniciando crawler (Puppeteer Mode)...`);

        const browser = await puppeteer.launch({
            headless: "new",
            args: ['--no-sandbox', '--disable-setuid-sandbox']
        });

        const listaTotal = [];

        try {
            const page = await browser.newPage();
            page.on('console', msg => {
                const text = msg.text();
                if (text.includes('pesquisa sem cache') || text.includes('Swiper')) return; // Ignore noisy site logs
                console.log(`   [BROWSER] ${text}`);
            });

            // Block known problematic trackers only, allowing more site resources
            await page.setRequestInterception(true);
            page.on('request', (req) => {
                const url = req.url();
                if (url.includes('google-analytics') || url.includes('facebook') || url.includes('reclameaqui') || url.includes('tracker') || url.includes('doubleclick')) {
                    req.abort();
                } else {
                    req.continue();
                }
            });

            await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36');

            // 1. Ir para Home para pegar IDs dos leilões
            console.log(`🔍 [${SITE}] Acessando Home para descobrir leilões...`);
            await page.goto(`${BASE_URL}/`, { waitUntil: 'networkidle2', timeout: TIMEOUT });

            const auctionIds = await page.evaluate(() => {
                const ids = new Set();

                // Method 1: Checkboxes (traditional)
                document.querySelectorAll('input[name="leilao_pesquisa[]"]').forEach(i => ids.add(i.value));

                // Method 2: Links like leilao.php?id=...
                document.querySelectorAll('a[href*="leilao.php?leilao_pesquisa="]').forEach(a => {
                    const match = a.href.match(/leilao_pesquisa=(\d+)/);
                    if (match) ids.add(match[1]);
                });

                return [...ids];
            });

            console.log(`📋 [${SITE}] Leilões encontrados: ${auctionIds.length} (${auctionIds.join(', ')})`);

            if (auctionIds.length === 0) {
                console.log(`⚠️ [${SITE}] Nenhum leilão encontrado na home.`);
            }

            // 2. Iterar sobre cada leilão
            for (const idLeilao of auctionIds) {
                try {
                    console.log(`➡️ [${SITE}] Crawling leilão ${idLeilao}...`);

                    let currentPageUrl = `${BASE_URL}/site/leilao.php?leilao_pesquisa=${idLeilao}`;
                    let pageCount = 0;

                    while (currentPageUrl) {
                        pageCount++;
                        console.log(`   📄 Processando página ${pageCount} do leilão ${idLeilao}`);

                        await page.goto(currentPageUrl, { waitUntil: WAIT_UNTIL, timeout: TIMEOUT });

                        // Esperar carregamento real dos cards (body do card)
                        await page.waitForSelector('.card-body', { timeout: 20000 }).catch(() => {
                            console.log(`⚠️ [${SITE}] Cards não renderizados para leilão ${idLeilao} após 20s.`);
                        });

                        const itens = await page.evaluate((baseUrl, currentAuctionId) => {
                            const results = [];
                            const cardContainers = document.querySelectorAll('.col-md-3');

                            cardContainers.forEach(container => {
                                const cardBody = container.querySelector('.card-body');
                                const icDiv = container.querySelector('.i-c');
                                const imgEl = icDiv ? icDiv.querySelector('img') : null;

                                if (!cardBody) return;

                                // Title
                                const titleEl = cardBody.querySelector('.quebraln.h6');
                                let title = titleEl ? titleEl.innerText.trim() : 'VEÍCULO';

                                // Year
                                const yearEl = cardBody.querySelector('.my-0.h6');
                                let year = yearEl ? yearEl.innerText.trim() : '';
                                const yearMatch = year.match(/(\d{4})/g);
                                const yearNum = yearMatch ? parseInt(yearMatch[yearMatch.length - 1]) : null;

                                // Condition
                                const conditionEl = cardBody.querySelector('.mt-0.small.mb-2');
                                const condition = conditionEl ? conditionEl.innerText.trim() : 'No estado';

                                // Price
                                const priceEl = cardBody.querySelector('.h3');
                                let priceStr = priceEl ? priceEl.innerText : '0';
                                priceStr = priceStr.replace('último lance', '').trim();

                                // Registro/Link
                                const onclick = icDiv ? icDiv.getAttribute('onclick') : '';
                                const match = onclick ? onclick.match(/exibir_lote\((\d+),(\d+)\)/) : null;
                                const registro = match ? match[1] : Math.random().toString(36).substr(2, 9);

                                // Photos
                                let fotos = [];
                                if (imgEl && imgEl.src) {
                                    let src = imgEl.getAttribute('src');
                                    if (src && !src.startsWith('http')) {
                                        src = baseUrl.endsWith('/') ? baseUrl + src : baseUrl + '/' + src;
                                    } else if (imgEl.src) {
                                        src = imgEl.src;
                                    }
                                    if (src && !src.includes('placeholder')) {
                                        fotos.push(src);
                                    }
                                }

                                // Info divs
                                const infos = Array.from(cardBody.querySelectorAll('.inf.small'));
                                let local = 'Juatuba - MG';
                                let dataStr = '';

                                infos.forEach(info => {
                                    const text = info.innerText;
                                    if (text.includes('Cajamar')) local = 'Cajamar - SP';
                                    if (text.includes('Simões Filho')) local = 'Simões Filho - BA';
                                    if (text.includes('Juatuba')) local = 'Juatuba - MG';

                                    const floatRight = info.querySelector('.float-right');
                                    if (floatRight && floatRight.innerText.includes('/')) {
                                        dataStr = floatRight.innerText.trim();
                                    }
                                });

                                const descricao = `${title} - ${year} - ${condition}`;

                                // CATEGORY FILTERING
                                const textToTest = (title + ' ' + descricao).toUpperCase();
                                const whitelist = ['AUTOMOVEL', 'VEICULO', 'CARRO', 'MOTO', 'CAMINHAO', 'ONIBUS', 'TRATOR', 'REBOQUE', 'SEMI-REBOQUE', 'CAVALO MECANICO', 'EMPILHADEIRA', 'RETROESCAVADEIRA', 'MAQUINA', 'SUCATA DE VEICULO', 'HONDA', 'TOYOTA', 'FIAT', 'VOLKSWAGEN', 'CHEVROLET', 'FORD', 'YAMAHA', 'KAWASAKI', 'SUZUKI', 'HYUNDAI', 'RENAULT'];
                                const blacklist = ['MOVEIS', 'ELETRO', 'INFORMÁTICA', 'SUCATA DE FERRO', 'LOTE DE PEÇAS', 'DIVERSOS', 'TELEVISAO', 'CELULAR', 'CADEIRA', 'MESA', 'ARMARIO', 'GELADEIRA', 'FOGAO', 'MACBOOK', 'IPHONE', 'NOTEBOOK', 'MONITOR', 'BEBEDOURO', 'SOFA', 'ROUPAS', 'CALCADOS', 'BOLSAS', 'BRINQUEDOS', 'IMOVEL', 'IMOVEIS', 'CASA', 'APARTAMENTO', 'TERRENO', 'SITIO', 'FAZENDA', 'GALPAO'];

                                const isWhitelisted = whitelist.some(w => textToTest.includes(w));
                                const isBlacklisted = blacklist.some(b => textToTest.includes(b));
                                const hasYear = yearNum && yearNum > 1900;

                                if (isBlacklisted && !hasYear) {
                                    console.log(`   🚫 Blacklisted: ${title}`);
                                    return;
                                }
                                if (!isWhitelisted && !hasYear) {
                                    console.log(`   ❓ Not whitelisted: ${title}`);
                                    return;
                                }

                                results.push({
                                    registro: { lote: parseInt(registro), leilao: parseInt(currentAuctionId) },
                                    veiculo: title,
                                    ano: yearNum,
                                    descricao: descricao,
                                    link: `${baseUrl}/site/lotem.php?cl=${registro}`,
                                    fotos: fotos,
                                    valor: parseFloat(priceStr.replace(/[^0-9,]/g, '').replace(',', '.')) || 0,
                                    dataStr: dataStr,
                                    localLeilao: local,
                                    condicao: condition
                                });
                            });
                            return results;
                        }, BASE_URL, idLeilao);

                        console.log(`   [${SITE}] Encontrados ${itens.length} itens na página ${pageCount}`);

                        itens.forEach(item => {
                            const timeObj = tratarDataHora(item.dataStr);
                            listaTotal.push({
                                registro: item.registro,
                                site: SITE,
                                link: item.link,
                                veiculo: item.veiculo,
                                ano: item.ano,
                                fotos: item.fotos,
                                valor: item.valor,
                                valorInicial: item.valor,
                                descricao: item.descricao,
                                localLeilao: item.localLeilao,
                                previsao: timeObj,
                                modalidade: 'leilao',
                                tipo: 'veiculo',
                                condicao: item.condicao
                            });
                        });

                        // Check for Next Page logic
                        const nextLink = await page.evaluate(() => {
                            const pageLinks = Array.from(document.querySelectorAll('.pagination .page-link'));
                            const next = pageLinks.find(a => a.innerText.includes('Próximo') || a.innerText.includes('Next') || a.innerText.includes('»'));
                            return next ? next.href : null;
                        });

                        if (nextLink && nextLink !== currentPageUrl) {
                            currentPageUrl = nextLink;
                        } else {
                            currentPageUrl = null;
                        }
                    }

                } catch (err) {
                    console.error(`❌ [${SITE}] Erro ao processar leilão ${idLeilao}:`, err.message);
                }
            }

            console.log(`✅ [${SITE}] Total final: ${listaTotal.length} lotes capturados.`);

        } catch (error) {
            console.error(`❌ [${SITE}] Erro Fatal:`, error.message);
        } finally {
            await browser.close();
        }
        return listaTotal;
    };

    const buscarESalvar = async () => {
        const lista = await listarLotes();
        if (lista.length > 0) {
            await salvarLista(lista);
        }
        return lista.length;
    };

    return { listarLotes, buscarESalvar, SITE };
};

export default createCrawler;
