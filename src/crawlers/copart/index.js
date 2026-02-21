
import fs from 'fs';
import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import { getExecutablePath, getCommonArgs, getRandomUserAgent } from '../../utils/browser.js';

puppeteer.use(StealthPlugin());
import { standardizeStatus } from '../../utils/status.js';
import { classifyVehicle } from '../../utils/vehicle-parser.js';

const SITE = 'copart.com.br';
const BASE_URL = 'https://www.copart.com.br';

const createCrawler = (db) => {
    const { salvarLista } = db;

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
                { id: 'VEHT:CAR', label: 'Carros' },
                { id: 'VEHT:MOTC', label: 'Motos' },
                { id: 'VEHT:PICK', label: 'Pickups' },
                { id: 'VEHT:SUVS', label: 'SUVs' },
                { id: 'VEHT:TRUK', label: 'Caminhões' }
            ];

            for (const cat of categories) {
                console.log(`🔍 [${SITE}] Categoria: ${cat.label}`);
                let pageNum = 1;
                let hasMore = true;

                while (hasMore && pageNum <= 50) {
                    const url = `${BASE_URL}/lotSearchResults?free=true&query=&page=${pageNum}&itemsPerPage=100&filter=${cat.id}`;
                    try {
                        let success = false;
                        for (let retry = 0; retry < 3; retry++) {
                            try {
                                await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 50000 });
                                success = true; break;
                            } catch (e) { await new Promise(r => setTimeout(r, 2000)); }
                        }
                        if (!success) { pageNum++; continue; }

                        const content = await page.content();
                        if (content.includes('Access Denied')) {
                            console.error(`      ❌ [${SITE}] Access Denied! Might be blocked.`);
                            break;
                        }

                        try {
                            await page.waitForSelector('table#serverSideDataTable tbody tr', { timeout: 15000 });
                        } catch (e) {
                            console.log(`      ⚠️ [${SITE}] Selector table#serverSideDataTable not found. Saving debug HTML...`);
                            fs.writeFileSync('copart-debug.html', content);
                            if (content.includes('No records found')) { hasMore = false; break; }
                            pageNum++; continue;
                        }

                        const diagItems = await page.evaluate((site, base) => {
                            const rows = document.querySelectorAll('table#serverSideDataTable tbody tr');
                            const results = [];
                            const diagnostics = [];

                            rows.forEach((row, idx) => {
                                try {
                                    const allLinks = Array.from(row.querySelectorAll('a')).map(a => ({
                                        text: a.innerText.trim(),
                                        uname: a.getAttribute('data-uname'),
                                        class: a.className,
                                        href: a.getAttribute('href')
                                    }));

                                    const linkEl = row.querySelector('a[data-uname="lotsearchLotnumber"]') ||
                                        row.querySelector('a[href*="/lot/"]') ||
                                        row.querySelector('a.lot-number');

                                    if (!linkEl) {
                                        if (idx < 3) diagnostics.push({ rowIdx: idx, links: allLinks, htmlSnippet: row.innerHTML.substring(0, 1000) });
                                        return;
                                    }

                                    const relativeLink = linkEl.getAttribute('href');
                                    const link = relativeLink.startsWith('http') ? relativeLink : `${base}${relativeLink.replace(/^\./, '')}`;
                                    const registro = linkEl.textContent.trim();

                                    const yearEl = row.querySelector('span[data-uname="lotsearchLotcenturyyear"]');
                                    const makeEl = row.querySelector('span[data-uname="lotsearchLotmake"]');
                                    const modelEl = row.querySelector('span[data-uname="lotsearchLotmodel"]');
                                    const veiculo = `${yearEl?.textContent || ''} ${makeEl?.textContent || ''} ${modelEl?.textContent || ''}`.trim();

                                    results.push({
                                        site, registro, link, veiculo,
                                        fotos: [], tipo: classifyVehicle(veiculo), modalidade: 'leilao'
                                    });
                                } catch (e) { }
                            });
                            return { results, rowCount: rows.length, diagnostics };
                        }, SITE, BASE_URL);

                        if (diagItems.results.length === 0 && diagItems.rowCount > 0) {
                            console.log(`      ⚠️ [DEBUG] Rows found but no items. Saving debug HTML...`);
                            fs.writeFileSync('copart-diag.html', content);
                            if (diagItems.diagnostics.length > 0) {
                                console.log('      🔍 [DEBUG] First row diagnostic:', JSON.stringify(diagItems.diagnostics[0], null, 2));
                            }
                        }

                        const items = diagItems.results;
                        console.log(`      DEBUG: Found ${diagItems.rowCount} rows, extracted ${items.length} items from page ${pageNum}`);

                        const extractDetails = async (p, url) => {
                            try {
                                await p.goto(url, { waitUntil: 'domcontentloaded', timeout: 50000 });
                                await new Promise(r => setTimeout(r, 4000)); // Wait for Angular binding

                                return await p.evaluate(() => {
                                    const v = (sel) => document.querySelector(sel)?.innerText?.trim() || '';
                                    const attr = (sel, at) => document.querySelector(sel)?.getAttribute(at) || '';

                                    // Photos from thumbnail roll - get highest res available
                                    const photos = [];
                                    document.querySelectorAll('.thumbImgblock img').forEach(img => {
                                        const src = img.getAttribute('hd-url') || img.getAttribute('full-url') || img.src;
                                        if (src && src.startsWith('http') && !photos.includes(src)) {
                                            photos.push(src);
                                        }
                                    });
                                    // Fallback to main image
                                    if (photos.length === 0) {
                                        const main = attr('#show-img', 'hd-url') || attr('#show-img', 'src');
                                        if (main) photos.push(main);
                                    }

                                    // Status and Bids - Look for labels and their adjacent spans
                                    const findByLabel = (text) => {
                                        const labels = Array.from(document.querySelectorAll('.details label, .formbox label'));
                                        const label = labels.find(l => l.innerText.includes(text));
                                        if (!label) return '';
                                        // Try sibling or parent's sibling
                                        return label.nextElementSibling?.innerText?.trim() ||
                                            label.parentElement?.querySelector('.lot-details-desc')?.innerText?.trim() || '';
                                    };

                                    const lanceAtualText = findByLabel('Lance Atual') || findByLabel('Venda Finalizada') || '';
                                    const statusText = findByLabel('Status da Venda') || findByLabel('Status do Lote') || (lanceAtualText.includes('Venda Finalizada') ? 'Venda Finalizada' : '');
                                    const incrementoText = findByLabel('Incremento') || '';

                                    const specs = {};
                                    // Extract all details from specification boxes
                                    document.querySelectorAll('.lot-details-inner .details').forEach(div => {
                                        const label = div.querySelector('label')?.innerText?.replace(':', '').trim();
                                        const value = div.querySelector('.lot-details-desc')?.innerText?.trim();
                                        if (label && value) specs[label] = value;
                                    });

                                    return { photos, lanceAtualText, statusText, incrementoText, specs };
                                });
                            } catch (e) {
                                console.error(`      ⚠️ Erro nos detalhes (${url}): ${e.message}`);
                                return null;
                            }
                        };

                        if (items.length > 0) {
                            const newItems = items.filter(i => {
                                if (seenIds.has(i.registro)) return false;
                                seenIds.add(i.registro);
                                return true;
                            });

                            if (newItems.length > 0) {
                                console.log(`   💎 [Enriquecendo ${newItems.length} itens Copart...]`);
                                for (const item of newItems) {
                                    const details = await extractDetails(page, item.link);
                                    if (details) {
                                        item.fotos = details.photos;
                                        // REQUIREMENT: Skip if no photos
                                        if (item.fotos.length === 0) continue;

                                        // Handle "Venda Finalizada" or empty values
                                        const cleanedValue = details.lanceAtualText.replace(/[^0-9]/g, '');
                                        item.valor = cleanedValue ? parseFloat(cleanedValue) : 0;
                                        item.incremento = details.incrementoText;
                                        item.situacao = standardizeStatus(details.statusText || (item.valor > 0 ? 'Aberto' : 'Encerrado'));

                                        // Enrich fields from specs
                                        const s = details.specs;
                                        item.condicao = s['Tipo de Documento'] || s['Tipo de Monta'] || s['Condição'];
                                        item.localLeilao = s['Pátio do Leilão'] || s['Pátio Veículo'] || s['Localização'];
                                        item.cor = s['Cor'];
                                        item.combustivel = s['Combustível'];
                                        item.cambio = s['Transmissão'];
                                        item.km = s['Odômetro'] ? parseInt(s['Odômetro'].replace(/[^0-9]/g, '')) : null;
                                        item.blindado = (item.veiculo || '').includes('BLIND') || details.lanceAtualText.includes('BLINDADO');

                                        item.descricao = Object.entries(s)
                                            .filter(([k]) => !['Comitente', 'Pátio Veículo', 'Pátio do Leilão'].includes(k))
                                            .map(([k, v]) => `${k}: ${v}`)
                                            .join(' | ');

                                        // Year/Make/Model if not already set or needing refinement
                                        if (s['Marca'] && s['Modelo']) {
                                            item.veiculo = `${s['Ano Fabricação'] || s['Ano de Fabricação'] || ''} ${s['Marca']} ${s['Modelo']} ${s['Versão'] || ''}`.trim();
                                        }

                                        await salvarLista([item]);
                                        totalCapturados++;
                                    }
                                }
                                console.log(`      ✅ [${cat.label}] Pág ${pageNum}: +${newItems.length} enriquecidos (Total: ${totalCapturados})`);
                            } else if (pageNum > 5) { hasMore = false; break; }
                        } else { hasMore = false; }
                    } catch (e) { console.error(`      ⚠️ [${SITE}] Erro: ${e.message}`); }
                    pageNum++;
                }
            }
            console.log(`✅ [${SITE}] Finalizado! Coletados: ${totalCapturados}`);
            return totalCapturados;
        } finally { await browser.close(); }
    };

    return { buscarTodos };
};

export default createCrawler;
