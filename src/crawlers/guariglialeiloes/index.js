import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import dotenv from 'dotenv';
import { getExecutablePath, getCommonArgs } from '../../utils/browser.js';

dotenv.config();
puppeteer.use(StealthPlugin());

const TIMEOUT = parseInt(process.env.CRAWLER_TIMEOUT_MS) || 90000;
const SITE = 'guariglialeiloes.com.br';
const BASE_URL = 'https://www.guariglialeiloes.com.br';

const trataDataHora = (dataStr) => {
    if (!dataStr) return { string: '', time: null, date: null };
    try {
        const match = dataStr.match(/(\d{1,2})\/(\d{1,2})\/(\d{2,4}).*?(\d{1,2})h(\d{2})/);
        if (match) {
            let [, dia, mes, ano, hora, minuto] = match;
            if (ano.length === 2) ano = '20' + ano;
            const date = new Date(ano, mes - 1, dia, hora, minuto);
            return { string: dataStr, time: date.getTime(), date };
        }
    } catch (e) { }
    return { string: dataStr, time: null, date: null };
};

const createCrawler = (db) => {
    const { salvarLista } = db;

    const buscarTodos = async () => {
        console.log(`🚀 [${SITE}] INICIANDO COLETA VIA PUPPETEER (Bypass 403)...`);

        const browser = await puppeteer.launch({
            executablePath: getExecutablePath(),
            headless: true,
            protocolTimeout: 240000,
            args: getCommonArgs()
        });

        let totalColetado = 0;

        try {
            const page = await browser.newPage();
            await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36');

            // 1. Get Active Auctions
            console.log(`   🔍 [${SITE}] Acessando home para listar leilões...`);
            await page.goto(BASE_URL, { waitUntil: 'networkidle2', timeout: TIMEOUT });
            await new Promise(r => setTimeout(r, 3000));

            const leiloes = await page.evaluate((baseUrl) => {
                const found = [];
                document.querySelectorAll('div.card-body.d-flex.flex-column').forEach(div => {
                    const tituloEl = div.querySelector('div.titulo-leilao');
                    const linkEl = div.querySelector('div.descricao-leilao.my-auto a');
                    const timeEl = div.querySelector('div.descricao-leilao.my-auto a strong');

                    if (linkEl && linkEl.href && linkEl.href.includes('/leilao/')) {
                        found.push({
                            titulo: tituloEl ? tituloEl.innerText.trim() : 'Leilão',
                            url: linkEl.href.startsWith('http') ? linkEl.href : `${baseUrl}${linkEl.getAttribute('href')}`,
                            dataHoraRaw: timeEl ? timeEl.innerText.trim() : ''
                        });
                    }
                });
                return found;
            }, BASE_URL);

            console.log(`   📊 [${SITE}] Encontrados ${leiloes.length} leilões ativos.`);

            // 2. Scrape each auction
            for (const leilao of leiloes) {
                console.log(`   🔄 [${SITE}] Processando: ${leilao.titulo}`);
                const dataHora = trataDataHora(leilao.dataHoraRaw);
                let pagina = 1;
                let hasMore = true;

                while (hasMore && pagina <= 20) {
                    try {
                        const pageUrl = `${leilao.url}?page=${pagina}`;
                        await page.goto(pageUrl, { waitUntil: 'networkidle2', timeout: TIMEOUT });
                        await page.waitForSelector('div.lote.rounded', { timeout: 15000 }).catch(() => null);
                        await new Promise(r => setTimeout(r, 2000));

                        const itens = await page.evaluate((site, baseUrl, dh, leilaoUrl) => {
                            const batch = [];
                            document.querySelectorAll('div.lote.rounded').forEach(div => {
                                const infoDiv = div.querySelector('div.col-lg-7 div.body-lote');
                                const lanceDiv = div.querySelector('div.col-lg-3 div.lance-lote');
                                const imgEl = div.querySelector('div.col-lg-2 img, div.img-lote img, img');
                                const linkEl = infoDiv ? infoDiv.querySelector('a') : null;

                                if (!linkEl) return;

                                const urlLote = linkEl.href.startsWith('http') ? linkEl.href : `${baseUrl}${linkEl.getAttribute('href')}`;
                                const textoCompleto = infoDiv.innerText;
                                const linhas = textoCompleto.split('\n').map(l => l.trim()).filter(Boolean);

                                // Veiculo
                                let veiculo = 'VEÍCULO';
                                const linhaMarca = linhas.find(l => /marca\s*\/?\s*modelo/i.test(l));
                                if (linhaMarca) {
                                    veiculo = linhaMarca.replace(/marca\s*\/?\s*modelo\s*:?\s*/gi, '').trim();
                                    if (!veiculo && linhaMarca.includes(':')) veiculo = linhaMarca.split(':').slice(1).join(':').trim();
                                }
                                if (!veiculo || veiculo === 'VEÍCULO' || veiculo.length < 2) {
                                    veiculo = linhas[0] || 'VEÍCULO';
                                    veiculo = veiculo.replace(/marca\s*\/?\s*modelo\s*:?\s*/gi, '').trim();
                                }

                                const anoLine = linhas.find(l => l.includes('Ano'));
                                const ano = anoLine ? parseInt(anoLine.split(':')[1]) : null;

                                const placaLine = linhas.find(l => l.includes('Placa'));
                                const placa = placaLine ? placaLine.split(':')[1].trim() : undefined;

                                const valorStr = lanceDiv ? lanceDiv.innerText.replace(/[^0-9,]/g, '').replace(',', '.') : '0';

                                // Fotos
                                const fotos = [];
                                if (imgEl) {
                                    let src = imgEl.src || imgEl.getAttribute('data-src');
                                    if (src) {
                                        if (!src.startsWith('http')) src = `${baseUrl}${src}`;
                                        fotos.push(src);
                                    }
                                }

                                batch.push({
                                    site: site,
                                    registro: urlLote.split('/').filter(Boolean).pop(),
                                    link: urlLote,
                                    veiculo: veiculo.toUpperCase(),
                                    ano: ano,
                                    valor: parseFloat(valorStr) || 0,
                                    previsao: dh,
                                    modalidade: 'leilao',
                                    tipo: 'veiculo',
                                    fotos: fotos,
                                    placa: placa
                                });
                            });
                            return batch;
                        }, SITE, BASE_URL, dataHora, leilao.url);

                        if (itens.length > 0) {
                            await salvarLista(itens);
                            totalColetado += itens.length;
                            console.log(`      ✅ [${SITE}] Pág ${pagina}: +${itens.length} itens.`);

                            // Check for next page
                            const hasNextMock = await page.evaluate(() => {
                                // Guariglia pagination often has "Próximo" or number links
                                const next = Array.from(document.querySelectorAll('.pagination a')).find(a => a.innerText.includes('›') || a.innerText.includes('Próximo'));
                                return !!next;
                            });

                            if (!hasNextMock && itens.length < 5) hasMore = false; // Heuristic
                            pagina++;
                        } else {
                            hasMore = false;
                        }

                    } catch (e) {
                        console.log(`      ⚠️ [${SITE}] Erro pág ${pagina}: ${e.message}`);
                        hasMore = false;
                    }
                }
            }

        } catch (e) {
            console.error(`❌ [${SITE}] Erro Fatal:`, e.message);
        } finally {
            await browser.close();
        }

        console.log(`✅ [${SITE}] Finalizado! ${totalColetado} veículos coletados.`);
        return totalColetado;
    };

    return { buscarTodos, SITE };
};

export default createCrawler;
