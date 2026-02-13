import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import dotenv from 'dotenv';

dotenv.config();
puppeteer.use(StealthPlugin());

const TIMEOUT = parseInt(process.env.CRAWLER_TIMEOUT_MS) || 45000;

/**
 * Trata string de data/hora para objeto com date e timestamp
 */
const tratarDataHora = (dataHoraStr) => {
    if (!dataHoraStr) return { string: '', time: null, date: null };
    const str = dataHoraStr.trim();
    // Ex: "12/02/26" or "12/02/2026"
    // Sometimes it might have time? specific logic needed?
    // The previous regex was /(\d{1,2})\/(\d{1,2})\/(\d{2,4})(?:\s*(\d{1,2}):(\d{2}))?/
    // The extracted string is "12/02/26".
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
            // User-Agent real
            await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36');

            // 1. Ir para Home para pegar IDs dos leilões
            console.log(`🔍 [${SITE}] Acessando Home para descobrir leilões...`);
            await page.goto(`${BASE_URL}/`, { waitUntil: 'networkidle2', timeout: TIMEOUT });

            const auctionIds = await page.evaluate(() => {
                const inputs = Array.from(document.querySelectorAll('input[name="leilao_pesquisa[]"]'));
                // Sort by date or just take them all
                return inputs.map(input => input.value);
            });

            console.log(`📋 [${SITE}] Leilões encontrados: ${auctionIds.length} (${auctionIds.join(', ')})`);

            if (auctionIds.length === 0) {
                console.log(`⚠️ [${SITE}] Nenhum leilão encontrado na home.`);
            }

            // 2. Iterar sobre cada leilão
            for (const idLeilao of auctionIds) {
                try {
                    console.log(`➡️ [${SITE}] Crawling leilão ${idLeilao}...`);
                    await page.goto(`${BASE_URL}/site/leilao.php?leilao_pesquisa=${idLeilao}`, { waitUntil: 'networkidle2', timeout: TIMEOUT });

                    // Esperar carregamento dos cards
                    await page.waitForSelector('.col-md-3', { timeout: 10000 }).catch(() => {
                        console.log(`⚠️ [${SITE}] Timeout aguardando lotes para leilão ${idLeilao} (pode estar vazio).`);
                    });

                    const itens = await page.evaluate((baseUrl, currentAuctionId) => {
                        const results = [];
                        const cardContainers = document.querySelectorAll('.col-md-3');

                        cardContainers.forEach(container => {
                            const cardBody = container.querySelector('.card-body');
                            const icDiv = container.querySelector('.i-c');
                            const imgEl = icDiv ? icDiv.querySelector('img') : null;

                            if (!cardBody) return;

                            // Title: div.quebraln.h6
                            const titleEl = cardBody.querySelector('.quebraln.h6');
                            let title = titleEl ? titleEl.innerText.trim() : 'VEÍCULO';
                            // Remove icons or prefixes if part of text? 
                            // title often has " HONDA/POP 110I". The icon is <i>. innerText should be fine.

                            // Year
                            const yearEl = cardBody.querySelector('.my-0.h6');
                            let year = yearEl ? yearEl.innerText.trim() : '';
                            // If it's like "2023/2024", take the model year (the second one) or just clean it
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

                            // Photos - Ensure absolute URLs
                            let fotos = [];
                            if (imgEl && imgEl.src) {
                                let src = imgEl.getAttribute('src');
                                if (src && !src.startsWith('http')) {
                                    src = baseUrl.endsWith('/') ? baseUrl + src : baseUrl + '/' + src;
                                } else if (imgEl.src) {
                                    src = imgEl.src; // Puppeteer sometimes resolves it automatically
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

                            // Construct description from title + year + condition
                            const descricao = `${title} - ${year} - ${condition}`;

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

                    console.log(`   [${SITE}] Encontrados ${itens.length} itens no leilão ${idLeilao}`);

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
