import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import dotenv from 'dotenv';
import connectDatabase from '../../database/db.js';
import { getExecutablePath, getCommonArgs } from '../../utils/browser.js';

dotenv.config();
puppeteer.use(StealthPlugin());

const TIMEOUT = parseInt(process.env.CRAWLER_TIMEOUT_MS) || 60000;

let db;

export const execute = async (database) => {
    db = database;
    const SITE = 'sodresantoro.com.br';
    console.log(`🚀 [${SITE}] SUPERCRAWLER: Iniciando captura massiva via API...`);

    const browser = await puppeteer.launch({
        executablePath: getExecutablePath(),
        headless: true,
        protocolTimeout: 240000,
        args: getCommonArgs()
    });

    let capturados = 0;
    try {
        const page = await browser.newPage();

        // Block heavy resources to speed up page load and save memory
        await page.setRequestInterception(true);
        page.on('request', (req) => {
            const type = req.resourceType();
            if (['image', 'stylesheet', 'font', 'media'].includes(type)) {
                req.abort();
            } else {
                req.continue();
            }
        });

        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36');

        // Navigate with retry logic for Railway resilience
        // Go to Home first to establish session/pass challenge
        const targetUrl = 'https://www.sodresantoro.com.br/';
        console.log(`   🔍 [${SITE}] Estabelecendo sessão...`);

        let pageLoaded = false;
        for (let attempt = 1; attempt <= 3; attempt++) {
            try {
                // Use networkidle2 to ensure challenge assets load
                await page.goto(targetUrl, { waitUntil: 'networkidle2', timeout: TIMEOUT });

                // Wait for a real element to confirm challenge pass - INCREASED TIMEOUT
                try {
                    console.log(`   ⏳ [${SITE}] Aguardando desafio WAF (até 60s)...`);
                    await page.waitForSelector('footer, #header, .header, nav, a[href*="/conta/login"]', { timeout: 60000 });
                    console.log(`   ✅ [${SITE}] Desafio WAF superado e página carregada.`);
                } catch (e) {
                    console.log(`   ⚠️ [${SITE}] Timeout esperando elemento da home. Tentando clicar em checkbox...`);
                    // Try to click challenge checkbox if present
                    try {
                        const frames = page.frames();
                        for (const frame of frames) {
                            const checkbox = await frame.$('.ctp-checkbox-label, input[type="checkbox"], #challenge-stage');
                            if (checkbox) {
                                await checkbox.click();
                                await new Promise(r => setTimeout(r, 5000));
                            }
                        }
                    } catch (err) { }
                }

                await new Promise(r => setTimeout(r, 3000));
                pageLoaded = true;
                console.log(`   ✅ [${SITE}] Sessão estabelecida (tentativa ${attempt})`);
                break;
            } catch (e) {
                console.log(`   ⚠️ [${SITE}] Tentativa ${attempt}/3 falhou: ${e.message}`);
                if (attempt === 3) throw e;
                await new Promise(r => setTimeout(r, 5000));
            }
        }

        if (!pageLoaded) throw new Error('Não foi possível carregar a página');

        // TURBO PAGINATION: Multiple index combinations to catch ALL vehicles
        const searchConfigs = [
            {
                label: 'Veículos + Judiciais',
                indices: ["veiculos", "judiciais-veiculos"],
                query: buildQuery(["online", "aberto", "encerrado", "programado"])
            },
            {
                label: 'Venda Direta',
                indices: ["venda-direta"],
                query: buildQuery(["online", "aberto", "programado"])
            },
            {
                label: 'Veículos Leilão',
                indices: ["veiculos"],
                query: buildQuery(["online", "aberto", "encerrado", "programado"])
            },
            {
                label: 'Judiciais',
                indices: ["judiciais-veiculos"],
                query: buildQuery(["online", "aberto", "encerrado", "programado"])
            }
        ];

        const seenIds = new Set();

        for (const config of searchConfigs) {
            console.log(`   📋 [${SITE}] Índice: ${config.label}`);
            let configCapturados = 0;
            let consecutiveErrors = 0;

            for (let offset = 0; offset < 20000; offset += 96) {
                try {
                    const newLots = await page.evaluate(async (searchConfig, from) => {
                        try {
                            const headers = {
                                'Content-Type': 'application/json',
                                'Accept': 'application/json, text/plain, */*',
                                'Origin': 'https://www.sodresantoro.com.br',
                                'Referer': 'https://www.sodresantoro.com.br/veiculos/lotes?page=1',
                                'User-Agent': navigator.userAgent
                            };

                            const response = await fetch('https://www.sodresantoro.com.br/api/search-lots', {
                                method: 'POST',
                                headers: headers,
                                body: JSON.stringify({
                                    indices: searchConfig.indices,
                                    query: searchConfig.query,
                                    from: from,
                                    size: 96,
                                    sort: [{ "lot_status_id_order": { "order": "asc" } }, { "lot_visits": { "order": "desc" } }]
                                })
                            });

                            if (response.status === 403 || response.status === 401 || !response.ok) throw new Error(`Status ${response.status}`);

                            const data = await response.json();
                            return { results: data.results || [], total: data.total || 0 };
                        } catch (e) {
                            // FALLBACK: DOM SCRAPING
                            const domItems = [];
                            document.querySelectorAll('.leilao-lote-card, .card-lote, div[class*="lote"]').forEach(card => {
                                try {
                                    const linkEl = card.querySelector('a');
                                    if (!linkEl) return;
                                    const link = linkEl.href;
                                    const title = (card.querySelector('.titulo, h3, h4, .leilao-lote-titulo')?.innerText || '').trim();
                                    const price = (card.querySelector('.valor, .leilao-lote-valor')?.innerText || '0').replace(/[^0-9,]/g, '').replace(',', '.');
                                    const img = card.querySelector('img')?.src;

                                    if (title.length > 5) {
                                        domItems.push({
                                            lot_id: link.split('/').pop(),
                                            produto: { descricao: title },
                                            valorAtual: String(price),
                                            imagens: img ? [{ url: img }] : [],
                                            leilaoId: 'fallback'
                                        });
                                    }
                                } catch (err) { }
                            });

                            if (domItems.length > 0) return { results: domItems, total: domItems.length, fromDOM: true };
                            return { results: [], total: 0, error: e.message };
                        }
                    }, config, offset);

                    if (newLots.error) {
                        console.log(`   ⚠️ [${SITE}] API error: ${newLots.error}`);
                        consecutiveErrors++;
                        if (consecutiveErrors >= 3) break;
                        continue;
                    }

                    consecutiveErrors = 0;

                    if (newLots.results.length === 0) {
                        console.log(`   🔸 [${SITE}] ${config.label} - Fim no offset ${offset}`);
                        break;
                    }

                    let veiculos = [];
                    if (newLots.fromDOM) {
                        // Direct usage of DOM items
                        console.log(`   ⚠️ [${SITE}] Usando dados do Fallback DOM (WAF Bypass)...`);
                        veiculos = newLots.results;
                    } else {
                        // Filter out already seen
                        const newResults = newLots.results.filter(item => {
                            const id = String(item.lot_id || item.id);
                            if (seenIds.has(id)) return false;
                            seenIds.add(id);
                            return true;
                        });
                        veiculos = processResults(newResults, SITE);
                    }

                    if (veiculos.length > 0) {
                        await db.salvarLista(veiculos);
                        capturados += veiculos.length;
                        configCapturados += veiculos.length;
                        console.log(`   ✅ [${SITE}] ${config.label} offset=${offset}: +${veiculos.length} veículos. Total: ${capturados} (API total: ${newLots.total})`);
                    }

                    // Stop if we're past the total
                    if (newLots.total > 0 && offset + 96 >= newLots.total) break;

                    await new Promise(r => setTimeout(r, 400));
                } catch (e) {
                    console.log(`   ⚠️ [${SITE}] Erro offset ${offset}: ${e.message}`);
                    consecutiveErrors++;
                    if (consecutiveErrors >= 3) {
                        console.log(`   ❌ [${SITE}] ${config.label} - 3 erros consecutivos, pulando.`);
                        break;
                    }
                }
            }

            if (configCapturados > 0) {
                console.log(`   📊 [${SITE}] ${config.label}: ${configCapturados} veículos.`);
            }
        }

    } catch (e) {
        console.error(`❌ [${SITE}] Erro:`, e.message);
    } finally {
        await browser.close();
        console.log(`✅ [${SITE}] Coleção finalizada: ${capturados} veículos encontrados.`);
    }
};

function buildQuery(statuses) {
    const statusShould = statuses.map(status => {
        if (status === 'encerrado') {
            return { bool: { must: [{ term: { auction_status: "encerrado" } }, { terms: { lot_status_id: [6] } }] } };
        }
        if (status === 'aberto') {
            return { bool: { must: [{ term: { auction_status: "aberto" } }], must_not: [{ terms: { lot_status_id: [5, 7] } }] } };
        }
        return { bool: { must: [{ term: { auction_status: status } }] } };
    });

    return {
        bool: {
            filter: [
                { bool: { should: statusShould, minimum_should_match: 1 } },
                { bool: { should: [{ bool: { must_not: { term: { lot_status_id: 6 } } } }, { bool: { must: [{ term: { lot_status_id: 6 } }, { term: { segment_id: 1 } }] } }], minimum_should_match: 1 } },
                { bool: { should: [{ bool: { must_not: [{ term: { lot_test: true } }] } }], minimum_should_match: 1 } }
            ]
        }
    };
}

function processResults(results, SITE) {
    return results.map(item => {
        const link = `https://www.sodresantoro.com.br/leilao/${item.auction_id}/lote/${item.lot_id}`;
        return {
            registro: String(item.lot_id || item.id),
            site: SITE,
            link: link,
            veiculo: (item.lot_title || item.lot_description || 'Veículo Sodré').toUpperCase(),
            fotos: item.lot_pictures || [],
            valor: parseFloat(item.bid_actual || item.bid_initial || 0),
            modalidade: 'leilao',
            localLeilao: item.lot_location || item.lot_location_address || 'Brasil',
            ano: item.lot_year_manufacture
                ? `${item.lot_year_manufacture}/${item.lot_year_model}`
                : item.lot_year_model || null,
            previsao: { string: item.lot_date_end || '' },
            tipo: 'veiculo'
        };
    }).filter(v => {
        // ENFORCE PHOTO FILTER: Only items with photos
        if (!v.fotos || v.fotos.length === 0) return false;

        const text = (v.veiculo + ' ' + (v.ano || '')).toUpperCase();
        const blacklist = [
            'MOVEIS', 'ELETRO', 'INFORMÁTICA', 'SUCATA DE FERRO', 'TELEVISAO', 'CELULAR',
            'CADEIRA', 'MESA', 'ARMARIO', 'GELADEIRA', 'FOGAO', 'MACBOOK', 'IPHONE', 'NOTEBOOK',
            'MONITOR', 'BEBEDOURO', 'SOFA', 'ROUPAS', 'CALCADOS', 'BOLSAS', 'BRINQUEDOS',
            'IMOVEL', 'IMOVEIS', 'CASA', 'APARTAMENTO', 'APTO', 'TERRENO', 'SITIO', 'FAZENDA',
            'GALPAO', 'MATERIAL', 'FERRAGENS', 'SUCATA DE BENS', 'ESCRITORIO', 'VAGA', 'GARAGEM'
        ];
        const whitelist = ['AUTOMOVEL', 'VEICULO', 'PICKUP', 'CAMINHAO', 'MOTO', 'MOTOCICLETA', 'ONIBUS', 'VAN', 'UTILITARIO', 'CAMINHONETE', 'SUV', 'SEDAN', 'HATCH'];
        const brands = ['HONDA', 'TOYOTA', 'FIAT', 'VOLKSWAGEN', 'CHEVROLET', 'FORD', 'YAMAHA', 'KAWASAKI', 'SUZUKI', 'HYUNDAI', 'RENAULT', 'JEEP', 'BMW', 'MERCEDES', 'NISSAN', 'MITSUBISHI', 'KIA', 'PEUGEOT', 'CITROEN', 'AUDI', 'VOLVO', 'PORSCHE', 'CHERY', 'IVECO', 'SCANIA', 'MAN', 'DAF', 'HARLEY', 'DUCATI', 'TRIUMPH'];

        const isBlacklisted = blacklist.some(b => text.includes(b));
        const isWhitelisted = whitelist.some(w => text.includes(w));
        const hasBrand = brands.some(b => text.includes(b));

        if (isBlacklisted && !isWhitelisted && !hasBrand) return false;

        // Accept: has brand, or has whitelist term, or has year, or doesn't trigger blacklist
        return true;
    });
}

// Create the standard createCrawler wrapper for the scheduler
const createCrawler = (db) => {
    const SITE = 'sodresantoro.com.br';

    const buscarTodos = async () => {
        await execute(db);
    };

    return { buscarTodos, SITE };
};

export default { execute, createCrawler };
