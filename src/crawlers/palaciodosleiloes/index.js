import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import dotenv from 'dotenv';

dotenv.config();
puppeteer.use(StealthPlugin());

const TIMEOUT = 180000;
const CONCURRENCY = 5; // Increased concurrency for speed

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
            let pageCount = 0;
            let emptyPages = 0;
            let currentPageUrl = `${BASE_URL}/site/leilao.php?leilao_pesquisa=${idLeilao}`;

            // Stop if 2 consecutive empty pages or max 50 pages
            while (emptyPages < 2 && pageCount < 50) {
                pageCount++;
                let retry = 0;
                let success = false;

                // REDUCED RETRIES: Fail fast on empty/timeout pages
                while (retry < 1 && !success) {
                    try {
                        console.log(`   📄 [Leilão ${idLeilao}] Página ${pageCount}`);
                        // REDUCED LOADING TIMEOUT: 20s is enough for loaded page
                        await page.goto(currentPageUrl, { waitUntil: 'domcontentloaded', timeout: 20000 });

                        // FAST CHECK: Wait for any content for max 5s
                        try {
                            await Promise.race([
                                page.waitForSelector('.card-body', { timeout: 5000 }),
                                page.waitForSelector('.col-md-3', { timeout: 5000 }),
                                page.waitForSelector('.i-c', { timeout: 5000 })
                            ]);
                        } catch (e) {
                            // If timeout, page likely empty or stuck. Stop retrying this page.
                            throw new Error('Timeout waiting for content (empty page?)');
                        }

                        const pageItens = await page.evaluate((baseUrl, currentAuctionId) => {
                            const found = [];
                            const cardContainers = document.querySelectorAll('.col-md-3, .col-lg-3, .col-sm-6');

                            cardContainers.forEach(container => {
                                try {
                                    const cardBody = container.querySelector('.card-body') || container;
                                    const titleEl = cardBody.querySelector('.quebraln.h6') || cardBody.querySelector('h6') || cardBody.querySelector('.card-title');
                                    if (!titleEl) return;

                                    let title = titleEl.innerText.trim();
                                    if (title.length < 3) return;

                                    const yearEl = cardBody.querySelector('.my-0.h6') || cardBody.querySelector('.inf.small') || cardBody.querySelector('.year');
                                    let year = yearEl ? yearEl.innerText.trim() : '';
                                    const yearMatch = year.match(/(\d{4})/g);
                                    const yearNum = yearMatch ? parseInt(yearMatch[yearMatch.length - 1]) : null;

                                    const conditionEl = cardBody.querySelector('.mt-0.small.mb-2') || cardBody.querySelector('.condition');
                                    const condition = conditionEl ? conditionEl.innerText.trim() : 'No estado';
                                    const priceEl = cardBody.querySelector('.h3') || cardBody.querySelector('.price') || cardBody.querySelector('[class*="valor"]');
                                    const priceStr = priceEl ? priceEl.innerText.replace(/[^0-9,]/g, '').replace(',', '.') : '0';

                                    const icDiv = container.querySelector('.i-c') || container.querySelector('[onclick*="exibir_lote"]');
                                    const onclick = icDiv ? (icDiv.getAttribute('onclick') || '') : '';
                                    const match = onclick ? onclick.match(/exibir_lote\((\d+),(\d+)\)/) : null;
                                    const registro = match ? match[1] : '';
                                    const directLink = container.querySelector('a[href*="lotem"]')?.href || '';

                                    const imgEl = container.querySelector('img');
                                    let foto = '';
                                    if (imgEl) {
                                        foto = imgEl.getAttribute('data-src') || imgEl.getAttribute('src') || '';
                                        if (foto.includes('placeholder') || foto.includes('data:image')) foto = '';
                                    }

                                    const text = (title + ' ' + condition + ' ' + year).toUpperCase();
                                    const blacklist = ['IMOVEL', 'APARTAMENTO', 'TERRENO', 'CASA', 'FAZENDA', 'GALPAO', 'ESCRITORIO', 'NOTEBOOK', 'CELULAR', 'IPHONE', 'MACBOOK', 'BEBEDOURO', 'SOFA', 'MESA', 'CADEIRA', 'ARMARIO', 'GELADEIRA'];
                                    const vehicleTerms = ['AUTOMOVEL', 'VEICULO', 'PICKUP', 'CAMINHAO', 'MOTO', 'MOTOCICLETA', 'ONIBUS', 'VAN', 'UTILITARIO', 'CAMINHONETE', 'SUV', 'SEDAN', 'HATCH', 'CARRO', 'REBOQUE', 'SEMI-REBOQUE', 'AUDI', 'BMW', 'MERCEDES', 'VOLVO', 'TOYOTA', 'HONDA', 'FIAT', 'VW', 'FORD', 'GM', 'CHEVROLET', 'NISSAN', 'HYUNDAI', 'KIA', 'PEUGEOT', 'CITROEN', 'RENAULT', 'JEEP', 'DODGE', 'RAM', 'CHERY', 'JAC', 'LIFAN', 'BYD', 'GWM', 'TROLLER', 'MITSUBISHI', 'SUZUKI', 'YAMAHA', 'KAWASAKI', 'DAF', 'SCANIA', 'IVECO', 'MAN', 'VOLKSWAGEN'];

                                    const isBlacklisted = blacklist.some(b => text.includes(b));
                                    const isVehicle = vehicleTerms.some(v => text.includes(v));
                                    const hasYear = /20[0-2]\d/.test(text) || /19[89]\d/.test(text);

                                    if (isBlacklisted && !isVehicle) return;
                                    if (!isVehicle && !hasYear) return;

                                    const finalLink = registro
                                        ? `${baseUrl}/site/lotem.php?cl=${registro}`
                                        : directLink || `${baseUrl}/site/leilao.php?leilao_pesquisa=${currentAuctionId}`;
                                    const finalId = registro || (directLink ? directLink.split('/').pop().split('?')[0] : `P${Math.random().toString(36).substr(2, 6)}`);

                                    found.push({
                                        registro: { lote: parseInt(finalId) || finalId, leilao: parseInt(currentAuctionId) },
                                        veiculo: title.toUpperCase(),
                                        ano: yearNum,
                                        descricao: `${title} - ${year} - ${condition}`,
                                        link: finalLink,
                                        fotos: foto ? [foto] : [],
                                        valor: parseFloat(priceStr) || 0,
                                        dataStr: '',
                                        localLeilao: 'MG/SP/BA',
                                        condicao: condition
                                    });
                                } catch (e) { }
                            });
                            return found;
                        }, BASE_URL, idLeilao);

                        const globalDate = await page.evaluate(() => {
                            const dateEl = document.querySelector('.fa-calendar-alt')?.parentElement;
                            return dateEl ? dateEl.innerText.trim() : '';
                        });

                        pageItens.forEach(item => {
                            if (!item.dataStr) item.dataStr = globalDate;
                            results.push(item);
                        });

                        if (pageItens.length === 0) emptyPages++;
                        else emptyPages = 0;

                        // Smart Navigation: Check for "Próximo" button existence first
                        const nextExists = await page.evaluate(() => {
                            const btns = document.querySelectorAll('.pagination a, .page-link, [onclick*="pagina"]');
                            for (const b of btns) {
                                if (b.innerText.includes('Wait') || b.innerText.includes('Próximo') || b.innerText.includes('»') || b.innerText.includes('>')) return true;
                            }
                            return false;
                        });

                        if (nextExists) {
                            currentPageUrl = `${BASE_URL}/site/leilao.php?leilao_pesquisa=${idLeilao}&pagina=${pageCount + 1}`;
                        } else {
                            if (pageItens.length >= 20) {
                                // Implicit pagination if full page
                                currentPageUrl = `${BASE_URL}/site/leilao.php?leilao_pesquisa=${idLeilao}&pagina=${pageCount + 1}`;
                            } else {
                                // No more pages likely
                                currentPageUrl = null;
                            }
                        }
                        success = true;

                    } catch (e) {
                        retry++;
                        console.log(`   ⚠️ [Leilão ${idLeilao}] Skip página ${pageCount} (${e.message})`);
                        // Don't retry more than once, just move on to next page if possible or stop
                        if (retry >= 1) currentPageUrl = null; // Assertive stop
                    }
                }
                if (!success || !currentPageUrl) break;
            }
        } finally {
            await page.close();
        }
        return results;
    };

    const listarLotes = async () => {
        console.log(`🚀 [${SITE}] OPTIMIZED: Inicializando com concorrência ${CONCURRENCY}...`);

        const browser = await puppeteer.launch({
            headless: "new",
            args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
        });

        const listaTotal = [];

        try {
            const page = await browser.newPage();
            /* 
               Discovery Strategy (Updated):
               1. Focus on Homepage (most reliable).
               2. Wait for AJAX content to load.
            */
            const discoveryUrls = [
                `${BASE_URL}/`, // Homepage is key
                `${BASE_URL}/site/leiloes.php`, // Try main list if exists
            ];

            const auctionIds = new Set();
            for (const dUrl of discoveryUrls) {
                try {
                    console.log(`   🔍 [${SITE}] Scanning ${dUrl}...`);
                    await page.goto(dUrl, { waitUntil: 'domcontentloaded', timeout: 45000 });

                    // Wait for dynamic content (essential for Palácio)
                    await new Promise(r => setTimeout(r, 8000));

                    const foundIds = await page.evaluate(() => {
                        const ids = [];
                        // Inputs
                        document.querySelectorAll('input').forEach(i => {
                            if (i.name && i.name.includes('leilao_pesquisa')) ids.push(i.value);
                        });
                        // Links
                        document.querySelectorAll('a').forEach(a => {
                            const m = (a.href || '').match(/leilao_pesquisa=(\d+)/);
                            if (m) ids.push(m[1]);
                        });
                        return [...new Set(ids)];
                    });
                    console.log(`   🔍 [${SITE}] Found ${foundIds.length} IDs on ${dUrl}`);
                    foundIds.forEach(id => auctionIds.add(id));
                } catch (err) {
                    console.log(`   ⚠️ [${SITE}] Error scanning ${dUrl}: ${err.message}`);
                }
            }
            await page.close();

            const sortedIds = [...auctionIds].map(Number).filter(n => !isNaN(n)).sort((a, b) => b - a);

            // FALLBACK if discovery fails
            if (sortedIds.length === 0) {
                console.log(`   ⚠️ [${SITE}] Discovery falhou (0 IDs). Usando range forçado (8200-8350)...`);
                for (let id = 8200; id <= 8350; id++) {
                    auctionIds.add(String(id));
                }
                sortedIds.push(8350); // Set fake max
            }

            if (sortedIds.length > 0) {
                const maxId = sortedIds[0];
                const minId = Math.max(sortedIds[sortedIds.length - 1] - 100, maxId - 100);
                console.log(`   🔍 [${SITE}] Varredura Range: ${minId} a ${maxId + 20}...`);
                for (let id = minId; id <= maxId + 20; id++) {
                    auctionIds.add(String(id));
                }
            }

            const idsArray = [...auctionIds].sort((a, b) => parseInt(b) - parseInt(a));
            console.log(`📋 [${SITE}] ${idsArray.length} leilões na fila. Processando...`);

            for (let i = 0; i < idsArray.length; i += CONCURRENCY) {
                const chunk = idsArray.slice(i, i + CONCURRENCY);
                const promises = chunk.map(id => crawlAuction(browser, id));
                const chunkResults = await Promise.all(promises);

                const flatResults = chunkResults.flat();
                if (flatResults.length > 0) {
                    const mapped = flatResults.map(item => ({
                        ...item,
                        site: SITE,
                        valorInicial: item.valor,
                        previsao: tratarDataHora(item.dataStr),
                        modalidade: 'leilao',
                        tipo: 'veiculo'
                    }));

                    await salvarLista(mapped);
                    listaTotal.push(...mapped);
                    console.log(`   🔸 [Pool] +${mapped.length} veiculos. Total: ${listaTotal.length} (Batch ${i / CONCURRENCY})`);
                }
            }

        } catch (error) {
            console.error(`❌ [${SITE}] Erro Fatal:`, error.message);
        } finally {
            // Close browser? No, let run logic handle it? No, we created it here.
            await browser.close();
        }

        console.log(`✅ [${SITE}] Finalizado! ${listaTotal.length} veículos coletados.`);
        return listaTotal;
    };

    const buscarESalvar = async () => {
        const lista = await listarLotes();
        return lista.length;
    };

    return { listarLotes, buscarESalvar, SITE };
};

export default createCrawler;
