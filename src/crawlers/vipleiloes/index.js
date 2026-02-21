
import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import * as cheerio from 'cheerio';
import { getExecutablePath, getCommonArgs, getRandomUserAgent } from '../../utils/browser.js';

puppeteer.use(StealthPlugin());
import { standardizeStatus } from '../../utils/status.js';
import { classifyVehicle, parseVehicleDetails, cleanTitle } from '../../utils/vehicle-parser.js';

const SITE = 'vipleiloes.com.br';
const BASE_URL = 'https://www.vipleiloes.com.br';

const createCrawler = (db) => {
    const { salvarLista } = db;

    const extractBasicInfo = (html) => {
        const $ = cheerio.load(html);
        const items = [];
        $('.card-anuncio').each((i, el) => {
            try {
                const card = $(el);
                const titleEl = card.find('.anc-title h1');
                const veiculo = titleEl.text().trim();
                const linkUrl = card.find('.anc-title a').attr('href');
                const link = linkUrl ? (linkUrl.startsWith('http') ? linkUrl : `${BASE_URL}${linkUrl}`) : '';
                if (veiculo && link) {
                    const matchId = link.match(/\/veiculo\/(\d+)/);
                    const registro = matchId ? matchId[1] : (link.split('/').filter(p => p).pop() || Date.now().toString());
                    const localLeilao = card.find('.anc-info-local span').text().trim();
                    const ano = card.find('.anc-info-detalhes p').first().text().trim();
                    items.push({
                        site: SITE, registro, link, veiculo, ano,
                        localLeilao, tipo: classifyVehicle(veiculo), modalidade: 'leilao'
                    });
                }
            } catch (e) { }
        });
        return { items, hasItems: items.length > 0 };
    };

    const crawlDetails = async (page, url) => {
        try {
            await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
            // Wait for data binding to populate
            await new Promise(r => setTimeout(r, 4000));

            return await page.evaluate(() => {
                const photos = [];
                document.querySelectorAll('.carousel-item img, .offer-thumb').forEach(img => {
                    const src = img.src || img.getAttribute('data-src');
                    if (src && src.startsWith('http') && !photos.includes(src)) {
                        photos.push(src);
                    }
                });

                const v = (sel) => document.querySelector(sel)?.innerText?.trim() || '';
                const lanceAtual = v('[data-bind-valoratual]') || v('.offer-value h2');
                const incremento = v('[data-bind-incremento]');
                const status = v('[data-bind-situacaonome]');

                // Attachments (Catalogs, Edicts, Reports)
                const attachments = [];
                document.querySelectorAll('a[href*=".pdf"], a[href*="Download"], .anc-edital a').forEach(a => {
                    const href = a.href;
                    const text = a.innerText.trim() || 'Documento';
                    if (href && !attachments.find(at => at.url === href)) {
                        attachments.push({ name: text, url: href });
                    }
                });

                // Attempt to capture Auction Date for Countdown
                let dataLeilaoISO = null;
                const dateText = v('.offer-info-auction p') || v('.offer-data-leilao') || v('.auction-date');
                if (dateText) {
                    // VIP usually shows: "25/02/2026 14:00"
                    const match = dateText.match(/(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2})/);
                    if (match) {
                        dataLeilaoISO = `${match[3]}-${match[2]}-${match[1]}T${match[4]}:${match[5]}:00`;
                    }
                }

                const specs = {};
                document.querySelectorAll('.offer-two-columns table tr').forEach(tr => {
                    const th = tr.querySelector('th');
                    const td = tr.querySelector('td');
                    if (th && td) specs[th.innerText.trim()] = td.innerText.trim();
                });

                return { photos, lanceAtual, incremento, status, specs, dataLeilaoISO, attachments };
            });
        } catch (e) {
            console.error(`      ⚠️ Erro nos detalhes (${url}): ${e.message}`);
            return null;
        }
    };

    const buscarTodos = async () => {
        console.log(`🚀 [${SITE}] TURBO PUPPETEER MODE: Iniciando captura por categorias...`);
        const browser = await puppeteer.launch({
            executablePath: getExecutablePath(),
            headless: 'new',
            protocolTimeout: 300000,
            args: [...getCommonArgs(), '--disable-web-security']
        });

        try {
            const page = await browser.newPage();
            await page.setRequestInterception(true);
            page.on('request', (req) => {
                const type = req.resourceType();
                if (['image', 'stylesheet', 'font', 'media'].includes(type) || req.url().includes('google-analytics')) {
                    req.abort();
                } else {
                    req.continue();
                }
            });

            await page.setUserAgent(getRandomUserAgent());
            await page.setViewport({ width: 1366, height: 768 });

            let totalCapturados = 0;
            const seenIds = new Set();
            const categories = [
                { id: 'Carro', label: 'Carros' },
                { id: 'Moto', label: 'Motos' },
                { id: 'Caminhao', label: 'Caminhões' },
                { id: 'Utilitario', label: 'Utilitários' },
                { id: 'Pesado', label: 'Pesados' },
                { id: 'Agricola', label: 'Agrícola' },
                { id: 'Maquinas', label: 'Máquinas' },
                { id: 'Sucata', label: 'Sucata' },
                { id: 'Nautica', label: 'Náutica' }
            ];

            for (const cat of categories) {
                console.log(`🔍 [${SITE}] Categoria: ${cat.label}`);
                let consecutiveEmptyPages = 0;

                for (let pageNum = 1; pageNum <= 100; pageNum++) {
                    const url = `${BASE_URL}/pesquisa?Filtro.TipoVeiculos=${cat.id}&Filtro.CurrentPage=${pageNum}&OrdenacaoVeiculo=DataInicio&Filtro.ItemsPerPage=48`;
                    try {
                        let success = false;
                        for (let retry = 0; retry < 3; retry++) {
                            try {
                                await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
                                success = true; break;
                            } catch (e) {
                                console.log(`      ⚠️ Retry ${retry + 1} for page ${pageNum}`);
                                await new Promise(r => setTimeout(r, 2000));
                            }
                        }
                        if (!success) continue;

                        // Quick check for results
                        const hasResults = await page.evaluate(() => {
                            return document.querySelectorAll('.card-anuncio').length > 0;
                        });

                        if (!hasResults) {
                            if ((await page.content()).includes('resultado encontrado')) {
                                console.log(`   ⏹️ [${cat.label}] No more results found at page ${pageNum}.`);
                                break;
                            }
                            consecutiveEmptyPages++;
                            if (consecutiveEmptyPages > 3) break;
                            continue;
                        }
                        consecutiveEmptyPages = 0;

                        const { items, hasItems } = extractBasicInfo(await page.content());
                        if (!hasItems) break;

                        const newItems = items.filter(i => {
                            if (seenIds.has(i.registro)) return false;
                            seenIds.add(i.registro);
                            return true;
                        });

                        if (newItems.length > 0) {
                            console.log(`   💎 [Capturando detalhes de ${newItems.length} novos itens...]`);
                            for (const item of newItems) {
                                const details = await crawlDetails(page, item.link);
                                if (details) {
                                    item.fotos = details.photos;
                                    // REQUIREMENT: Skip if no photos
                                    if (!item.fotos || item.fotos.length === 0) continue;

                                    item.valor = parseFloat(details.lanceAtual.replace(/[^0-9,]/g, '').replace(',', '.')) || 0;
                                    item.incremento = details.incremento;
                                    item.situacao = standardizeStatus(details.status);

                                    // Ninja Standards: Data/Hora for Countdown
                                    item.dataLeilao = details.dataLeilaoISO || null;
                                    item.anexos = details.attachments || [];

                                    const s = details.specs;
                                    // Use the enhanced parser
                                    const parsedDetails = parseVehicleDetails(item.veiculo + ' ' + item.descricao, s);

                                    item.ano = parsedDetails.ano;
                                    item.cor = s['Cor'];
                                    item.combustivel = s['Combustível'];
                                    item.cambio = s['Câmbio'];
                                    item.km = s['KM'] ? parseInt(s['KM'].replace(/[^0-9]/g, '')) : null;
                                    item.blindado = parsedDetails.blindado;
                                    item.chave = parsedDetails.chave;
                                    item.condicao = parsedDetails.condicao;

                                    // NINJA ELITE DEEP FIELDS
                                    item.localColisao = parsedDetails.localColisao;
                                    item.origem = parsedDetails.origem;
                                    item.comitente = parsedDetails.comitente;
                                    item.debitoResponsabilidade = parsedDetails.debitoResponsabilidade;
                                    item.remarcado = parsedDetails.remarcado;

                                    // Clean the title for Brand/Model standard
                                    item.veiculo = cleanTitle(item.veiculo);

                                    item.descricao = Object.entries(details.specs).map(([k, v]) => `${k}: ${v}`).join(' | ');
                                }

                                // Now salvarLista is async-friendly (marks for enrichment)
                                await salvarLista([item]);
                                totalCapturados++;

                                // Small delay between detail captures to avoid hammering
                                await new Promise(r => setTimeout(r, 500));
                            }
                            console.log(`   ✅ [${cat.label}] Pág ${pageNum}: +${newItems.length} (Total VIP: ${totalCapturados})`);
                        } else {
                            // If we see many already captured items in a row, we might be reaching the end of "new" items
                            if (pageNum > 50) {
                                console.log(`   ⏭️ [${cat.label}] High overlap at page ${pageNum}, skipping category.`);
                                break;
                            }
                        }
                    } catch (e) { console.error(`   ❌ [${SITE}] Erro na página ${pageNum}: ${e.message}`); }
                }
            }
            console.log(`✅ [${SITE}] Finalizado! ${totalCapturados} itens enriquecidos coletados.`);
            return totalCapturados;
        } finally { await browser.close(); }
    };

    return { buscarTodos };
};

export default createCrawler;
