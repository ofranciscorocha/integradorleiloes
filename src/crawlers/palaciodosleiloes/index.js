import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import dotenv from 'dotenv';

dotenv.config();
puppeteer.use(StealthPlugin());

const TIMEOUT = parseInt(process.env.CRAWLER_TIMEOUT_MS) || 120000; // Increased to 120s
const CONCURRENCY = 3; // Process 3 auctions in parallel

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

    const crawlAuction = async (browser, idLeilao) => {
        const results = [];
        const page = await browser.newPage();
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36');

        try {
            let currentPageUrl = `${BASE_URL}/site/leilao.php?leilao_pesquisa=${idLeilao}`;
            let pageCount = 0;

            while (currentPageUrl) {
                pageCount++;
                let retry = 0;
                let success = false;

                while (retry < 3 && !success) {
                    try {
                        console.log(`   📄 [Leilão ${idLeilao}] Página ${pageCount} (Tentativa ${retry + 1})`);
                        await page.goto(currentPageUrl, { waitUntil: 'networkidle2', timeout: TIMEOUT });

                        // Wait for any relevant container
                        await Promise.race([
                            page.waitForSelector('.card-body', { timeout: 15000 }),
                            page.waitForSelector('.col-md-3', { timeout: 15000 })
                        ]);

                        const pageItens = await page.evaluate((baseUrl, currentAuctionId) => {
                            const found = [];
                            const cardContainers = document.querySelectorAll('.col-md-3');

                            cardContainers.forEach(container => {
                                const cardBody = container.querySelector('.card-body') || container;
                                const titleEl = cardBody.querySelector('.quebraln.h6') || cardBody.querySelector('h6');
                                if (!titleEl) return;

                                let title = titleEl.innerText.trim();
                                if (title.length < 3) return;

                                // Year
                                const yearEl = cardBody.querySelector('.my-0.h6') || cardBody.querySelector('.inf.small');
                                let year = yearEl ? yearEl.innerText.trim() : '';
                                const yearMatch = year.match(/(\d{4})/g);
                                const yearNum = yearMatch ? parseInt(yearMatch[yearMatch.length - 1]) : null;

                                // Condition/Price
                                const condition = (cardBody.querySelector('.mt-0.small.mb-2') || { innerText: 'No estado' }).innerText.trim();
                                const priceStr = (cardBody.querySelector('.h3') || { innerText: '0' }).innerText.replace(/[^0-9,]/g, '').replace(',', '.');

                                // ID/Registration
                                const icDiv = container.querySelector('.i-c');
                                const onclick = icDiv ? icDiv.getAttribute('onclick') : '';
                                const match = onclick ? onclick.match(/exibir_lote\((\d+),(\d+)\)/) : null;
                                const registro = match ? match[1] : `P${Math.random().toString(36).substr(2, 5)}`;

                                // Image
                                const imgEl = container.querySelector('img');
                                let foto = imgEl ? imgEl.src : '';
                                if (foto.includes('placeholder')) {
                                    foto = imgEl.getAttribute('data-src') || imgEl.getAttribute('src');
                                }

                                // FUZZY FILTER: Keep if has year or looks like vehicle
                                const text = (title + ' ' + condition).toUpperCase();
                                const blacklist = [
                                    'MOVEIS', 'ELETRO', 'INFORMÁTICA', 'SUCATA DE FERRO', 'PEÇAS', 'TELEVISAO', 'CELULAR',
                                    'CADEIRA', 'MESA', 'ARMARIO', 'GELADEIRA', 'FOGAO', 'MACBOOK', 'IPHONE', 'NOTEBOOK',
                                    'MONITOR', 'BEBEDOURO', 'SOFA', 'ROUPAS', 'CALCADOS', 'BOLSAS', 'BRINQUEDOS',
                                    'IMOVEL', 'IMOVEIS', 'CASA', 'APARTAMENTO', 'TERRENO', 'SITIO', 'FAZENDA', 'GALPAO',
                                    'MATERIAL', 'FERRAGENS', 'SUCATA DE BENS', 'ESCRITORIO', 'EQUIPAMENTO', 'MAQUINAS'
                                ];

                                const isBlacklisted = blacklist.some(b => text.includes(b));
                                const whitelist = ['AUTOMOVEL', 'VEICULO', 'PICKUP', 'CAMINHAO', 'MOTO', 'MOTOCICLETA', 'ONIBUS', 'VAN', 'UTILITARIO'];
                                const isWhitelisted = whitelist.some(w => text.includes(w));

                                // If it's explicitly blacklisted, we drop it (even if it has a year, as real estate can have years)
                                if (isBlacklisted && !isWhitelisted) return;

                                // If it's not blacklisted, we still want to ensure it's a vehicle or has a year
                                if (!yearNum && !isWhitelisted) {
                                    // Final check: brand names
                                    const brands = ['HONDA', 'TOYOTA', 'FIAT', 'VOLKSWAGEN', 'CHEVROLET', 'FORD', 'YAMAHA', 'KAWASAKI', 'SUZUKI', 'HYUNDAI', 'RENAULT', 'JEEP', 'BMW', 'MERCEDES'];
                                    const hasBrand = brands.some(b => text.includes(b));
                                    if (!hasBrand) return;
                                }

                                found.push({
                                    registro: { lote: parseInt(registro) || registro, leilao: parseInt(currentAuctionId) },
                                    veiculo: title,
                                    ano: yearNum,
                                    descricao: `${title} - ${year} - ${condition}`,
                                    link: `${baseUrl}/site/lotem.php?cl=${registro}`,
                                    fotos: foto ? [foto] : [],
                                    valor: parseFloat(priceStr) || 0,
                                    dataStr: '', // Will be filled below if found
                                    localLeilao: 'MG/SP/BA', // Generic fallback
                                    condicao: condition
                                });
                            });
                            return found;
                        }, BASE_URL, idLeilao);

                        // Capture generic lottery date for the whole page if not in cards
                        const globalDate = await page.evaluate(() => {
                            const dateEl = document.querySelector('.fa-calendar-alt')?.parentElement;
                            return dateEl ? dateEl.innerText.trim() : '';
                        });

                        pageItens.forEach(item => {
                            if (!item.dataStr) item.dataStr = globalDate;
                            results.push(item);
                        });

                        // Next Page link
                        const nextLink = await page.evaluate(() => {
                            const next = Array.from(document.querySelectorAll('.pagination .page-link'))
                                .find(a => a.innerText.includes('Próximo') || a.innerText.includes('»') || a.innerText.includes('Next'));
                            return next ? next.href : null;
                        });

                        if (nextLink && nextLink !== currentPageUrl) {
                            currentPageUrl = nextLink;
                        } else {
                            currentPageUrl = null;
                        }

                        success = true;
                    } catch (e) {
                        retry++;
                        console.log(`   ⚠️ [Leilão ${idLeilao}] Erro na página ${pageCount}, tentando novamente... (${retry}/3)`);
                        await new Promise(r => setTimeout(r, 2000 * retry));
                    }
                }
                if (!success) break; // Skip the rest of this auction if too many errors
            }
        } finally {
            await page.close();
        }
        return results;
    };

    const listarLotes = async () => {
        console.log(`🚀 [${SITE}] High-Yield Mode: Inicializando com concorrência ${CONCURRENCY}...`);

        const browser = await puppeteer.launch({
            headless: "new",
            args: ['--no-sandbox', '--disable-setuid-sandbox']
        });

        const listaTotal = [];

        try {
            const page = await browser.newPage();
            console.log(`🔍 [${SITE}] Mapeando leilões ativos across pages...`);
            const discoveryUrls = [
                `${BASE_URL}/`,
                `${BASE_URL}/site/leiloes_andamento.php`,
                `${BASE_URL}/site/proximos_leiloes.php`
            ];

            const auctionIds = new Set();
            for (const dUrl of discoveryUrls) {
                try {
                    await page.goto(dUrl, { waitUntil: 'networkidle2', timeout: 30000 });
                    const foundIds = await page.evaluate(() => {
                        const ids = [];
                        document.querySelectorAll('input[name="leilao_pesquisa[]"]').forEach(i => ids.push(i.value));
                        document.querySelectorAll('a[href*="leilao_pesquisa="]').forEach(a => {
                            const m = a.href.match(/leilao_pesquisa=(\d+)/);
                            if (m) ids.push(m[1]);
                        });
                        return ids;
                    });
                    foundIds.forEach(id => auctionIds.add(id));
                } catch (err) { }
            }

            const idsArray = [...auctionIds];
            console.log(`📋 [${SITE}] ${idsArray.length} leilões detectados. Iniciando processamento paralelo...`);

            // Parallel execution with chunking
            for (let i = 0; i < idsArray.length; i += CONCURRENCY) {
                const chunk = idsArray.slice(i, i + CONCURRENCY);
                const promises = chunk.map(id => crawlAuction(browser, id));
                const chunkResults = await Promise.all(promises);

                chunkResults.flat().forEach(item => {
                    const timeObj = tratarDataHora(item.dataStr);
                    listaTotal.push({
                        ...item,
                        site: SITE,
                        valorInicial: item.valor,
                        previsao: timeObj,
                        modalidade: 'leilao',
                        tipo: 'veiculo'
                    });
                });
                console.log(`   🔸 [Pool] Processado lote de leilões ${i + 1}-${i + chunk.length}. Total acumulado: ${listaTotal.length}`);
            }

        } catch (error) {
            console.error(`❌ [${SITE}] Erro Fatal na Orquestração:`, error.message);
        } finally {
            await browser.close();
        }

        console.log(`✅ [${SITE}] Sucesso! Coleta finalizada com ${listaTotal.length} veículos.`);
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
