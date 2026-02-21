import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import dotenv from 'dotenv';
import { getExecutablePath, getCommonArgs, getRandomUserAgent } from '../../utils/browser.js';

dotenv.config();
puppeteer.use(StealthPlugin());
import { standardizeStatus } from '../../utils/status.js';
import { classifyVehicle, parseVehicleDetails, cleanTitle } from '../../utils/vehicle-parser.js';

const TIMEOUT = parseInt(process.env.CRAWLER_TIMEOUT_MS) || 90000;
const SITE = 'guariglialeiloes.com.br';
const BASE_URL = 'https://www.guariglialeiloes.com.br';

const createCrawler = (db) => {
    const { salvarLista } = db;

    const buscarTodos = async () => {
        console.log(`🚀 [${SITE}] Iniciando captura (System: Soleon/João Emílio)...`);

        const browser = await puppeteer.launch({
            executablePath: getExecutablePath(),
            headless: true,
            protocolTimeout: 300000,
            args: getCommonArgs()
        });

        let totalColetado = 0;

        try {
            const page = await browser.newPage();
            await page.setUserAgent(getRandomUserAgent());

            // 1. Get Active Auctions
            console.log(`   🔍 [${SITE}] Acessando home para listar leilões...`);
            await page.goto(BASE_URL, { waitUntil: 'networkidle2', timeout: TIMEOUT });
            await new Promise(r => setTimeout(r, 4000));

            // Scrape auctions
            const leiloes = await page.evaluate((baseUrl) => {
                const found = [];
                // Target cards in home (usually similar structure)
                document.querySelectorAll('a[href*="/leilao/"], .card-leilao, .leilao-item, div.descricao-leilao a').forEach(el => {
                    const link = el.href || el.querySelector('a')?.href;
                    // Get title
                    let title = el.innerText;
                    const titleEl = el.closest('.card')?.querySelector('.titulo-leilao');
                    if (titleEl) title = titleEl.innerText;

                    if (link && link.includes('/leilao/') && !found.find(f => f.url === link)) {
                        found.push({
                            url: link,
                            titulo: title.split('\n')[0].trim() || 'Leilão'
                        });
                    }
                });
                return found;
            }, BASE_URL);

            console.log(`   📊 [${SITE}] Encontrados ${leiloes.length} leilões potenciais.`);

            for (const leilao of leiloes) {
                console.log(`   🔄 [${SITE}] Processando: ${leilao.titulo}`);
                try {
                    await page.goto(leilao.url, { waitUntil: 'networkidle2', timeout: TIMEOUT });
                    await new Promise(r => setTimeout(r, 2000));

                    // Extract lots from auction page
                    const itens = await page.evaluate((site, baseUrl) => {
                        const batch = [];
                        // Target lot cards (Soleon System Pattern)
                        const requestCards = document.querySelectorAll('.lote, .lote-card, .card-lote, .item-lote, .card');

                        requestCards.forEach(card => {
                            // Selectors based on verified HTML from João Emílio (Soleon)
                            const titleEl = card.querySelector('h5, .titulo, .descricao, .card-title, h3');
                            const descEl = card.querySelector('div[style*="text-align: justify"], .desc-lote, .body-lote');
                            const linkEl = card.querySelector('a[href*="/item/"], a[href*="/lote/"]');
                            const priceEl = card.querySelector('.maior-lance h4, .valor, .preco, .price, .lance-lote');

                            // Image can be an IMG tag or a background-image on an A tag
                            let imgSrc = '';
                            const valImg = card.querySelector('img');
                            if (valImg) {
                                imgSrc = valImg.src || valImg.getAttribute('data-src');
                            } else {
                                const bgEl = card.querySelector('a.rounded[style*="background"], div[style*="background-image"]');
                                if (bgEl) {
                                    const style = bgEl.getAttribute('style');
                                    const match = style.match(/url\(['"]?(.*?)['"]?\)/);
                                    if (match) imgSrc = match[1];
                                }
                            }

                            if (linkEl && (titleEl || descEl)) {
                                // REQUIREMENT: Skip if no photos
                                if (!imgSrc) return;

                                let title = titleEl ? titleEl.innerText.trim() : '';
                                const description = descEl ? descEl.innerText.trim() : '';

                                // ... existing title logic ...
                                if ((!title || title.length < 5 || title.includes('VEÍCULOS') || title.includes('MATERIAIS')) && description) {
                                    title = description.split('\n')[0].substring(0, 100);
                                    const lines = description.split('\n');
                                    const brandLine = lines.find(l => /marca|modelo/i.test(l));
                                    if (brandLine) {
                                        const cleanBrand = brandLine.replace(/marca|modelo|\/|:/gi, ' ').trim();
                                        if (cleanBrand.length > 5) title = cleanBrand;
                                    }
                                }

                                title = title.replace(/\s+/g, ' ').trim();
                                if (!title) return;

                                const url = linkEl.href;
                                const valorText = priceEl ? priceEl.innerText.replace(/[^0-9,]/g, '').replace(',', '.') : '0';

                                const statusEl = card.querySelector('.msg-condicional, .lance-vencido, .status, .label-info');
                                const statusRaw = statusEl?.innerText.trim() || '';

                                batch.push({
                                    site: site,
                                    registro: url.split('/').pop().split('?')[0],
                                    link: url,
                                    veiculo: title.toUpperCase(), // Will be cleaned later in the map
                                    valor: parseFloat(valorText) || 0,
                                    fotos: [imgSrc],
                                    modalidade: 'leilao',
                                    tipo: 'veiculo',
                                    situacaoRaw: statusRaw || (valorText !== '0' ? 'Em andamento' : 'Disponível'),
                                    descricao: description,
                                    // Extracting raw date placeholder for enrichment
                                    dataLeilaoRaw: card.querySelector('.msg-data, .msg-info, .card-footer')?.innerText || ''
                                });
                            }
                        });
                        return batch;
                    }, SITE, BASE_URL);

                    if (itens.length > 0) {
                        const enriched = itens.map(item => {
                            item.situacao = standardizeStatus(item.situacaoRaw);
                            delete item.situacaoRaw;

                            const parsed = parseVehicleDetails(item.veiculo + ' ' + (item.descricao || ''));

                            item.ano = parsed.ano;
                            item.combustivel = parsed.combustivel;
                            item.cor = parsed.cor;
                            item.km = parsed.km;
                            item.cambio = parsed.cambio;
                            item.chave = parsed.chave;
                            item.blindado = parsed.blindado;
                            item.condicao = parsed.condicao;

                            // Ninja Standards: Cleaned Title
                            item.veiculo = cleanTitle(item.veiculo);

                            // NINJA ELITE DEEP FIELDS
                            item.localColisao = parsed.localColisao;
                            item.origem = parsed.origem;
                            item.comitente = parsed.comitente;
                            item.debitoResponsabilidade = parsed.debitoResponsabilidade;
                            item.remarcado = parsed.remarcado;
                            item.anexos = []; // Soleon home listings usually don't have direct PDF links without detail crawl

                            // Ninja Standards: Countdown Date
                            if (item.dataLeilaoRaw) {
                                const match = item.dataLeilaoRaw.match(/(\d{2})\/(\d{2})\/(\d{4})\s+(?:às\s+)?(\d{2}):(\d{2})/);
                                if (match) {
                                    item.dataLeilao = `${match[3]}-${match[2]}-${match[1]}T${match[4]}:${match[5]}:00`;
                                }
                            }
                            delete item.dataLeilaoRaw;

                            return item;
                        });
                        await salvarLista(enriched);
                        totalColetado += enriched.length;
                        console.log(`      ✅ [${SITE}] +${enriched.length} veículos coletados.`);
                    }
                } catch (err) {
                    console.log(`      ⚠️ [${SITE}] Erro no leilão: ${err.message}`);
                }
            }

        } catch (e) {
            console.error(`❌ [${SITE}] Erro Fatal:`, e.message);
        } finally {
            await browser.close();
        }

        console.log(`✅ [${SITE}] Finalizado! Coleta total: ${totalColetado}`);
        return totalColetado;
    };

    return { buscarTodos, SITE };
};

export default createCrawler;
