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
        await page.setRequestInterception(true);
        page.on('request', (req) => {
            const type = req.resourceType();
            if (['image', 'stylesheet', 'font', 'media'].includes(type)) {
                req.abort();
            } else {
                req.continue();
            }
        });

        // Advanced WAF Bypass: Random User-Agent
        const userAgents = [
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36 Edg/122.0.0.0'
        ];
        const randomUA = userAgents[Math.floor(Math.random() * userAgents.length)];
        await page.setUserAgent(randomUA);

        const targetUrl = 'https://www.sodresantoro.com.br/';
        console.log(`   🔍 [${SITE}] Estabelecendo sessão (Warm-up 2.0) com UA: ${randomUA.substring(0, 50)}...`);

        let pageLoaded = false;
        // Increase attempts and timeout for Railway
        for (let attempt = 1; attempt <= 4; attempt++) {
            try {
                // Use domcontentloaded first, then wait for selector manually
                await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: TIMEOUT + 10000 });

                try {
                    console.log(`   ⏳ [${SITE}] Aguardando banner ou footer...`);
                    // Wait for distinct elements that indicate SUCCESSFUL load (not 403 page)
                    await page.waitForSelector('footer, .search-bar, #header-desk', { timeout: 30000 });
                } catch (e) {
                    console.log(`   ⚠️ [${SITE}] Timeout esperando elementos visuais. WAF pode estar bloqueando.`);
                }

                // Explicit wait to ensure Cloudflare/WAF session is sticky
                await new Promise(r => setTimeout(r, 5000 + (Math.random() * 3000)));
                pageLoaded = true;
                console.log(`   ✅ [${SITE}] Sessão estabilizada.`);
                break;
            } catch (e) {
                console.log(`   ⚠️ [${SITE}] Tentativa ${attempt}/4 falhou: ${e.message}`);
                if (attempt === 4) throw e;
                await new Promise(r => setTimeout(r, 15000));
            }
        }

        if (!pageLoaded) throw new Error('Não foi possível carregar a página');

        const searchConfigs = [
            { label: 'Veículos + Judiciais', indices: ["veiculos", "judiciais-veiculos"], query: buildQuery(["online", "aberto", "encerrado", "programado"], [1, 2, 3, 27]) },
            { label: 'Imóveis', indices: ["imoveis"], query: buildQuery(["online", "aberto", "programado"], [4]) },
            { label: 'Diversos', indices: ["diversos"], query: buildQuery(["online", "aberto", "programado"], [5, 6, 7, 8, 9, 10]) },
            { label: 'Venda Direta', indices: ["venda-direta"], query: buildQuery(["online", "aberto", "programado"], [1, 2, 3, 4, 5, 27]) }
        ];

        const seenIds = new Set();
        for (const config of searchConfigs) {
            console.log(`   📋 [${SITE}] Índice: ${config.label}`);
            let configCapturados = 0;

            for (let offset = 0; offset < 20000; offset += 96) {
                try {
                    // Jitter: Add a small random delay to disrupt bot detection
                    const jitter = Math.floor(Math.random() * 2000) + 500;
                    await new Promise(r => setTimeout(r, jitter));

                    const cookies = await page.cookies();
                    const cookieStr = cookies.map(c => `${c.name}=${c.value}`).join('; ');
                    const userAgent = await page.evaluate(() => navigator.userAgent);

                    let results = [];
                    try {
                        const response = await fetch('https://www.sodresantoro.com.br/api/search-lots', {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/json',
                                'Accept': 'application/json, text/plain, */*',
                                'Origin': 'https://www.sodresantoro.com.br',
                                'Referer': 'https://www.sodresantoro.com.br/veiculos/lotes',
                                'User-Agent': userAgent,
                                'Cookie': cookieStr,
                                'X-Requested-With': 'XMLHttpRequest',
                                'Sec-Fetch-Dest': 'empty',
                                'Sec-Fetch-Mode': 'cors',
                                'Sec-Fetch-Site': 'same-origin',
                                'sec-ch-ua-mobile': '?0',
                                'sec-ch-ua-platform': '"Windows"'
                            },
                            body: JSON.stringify({
                                indices: config.indices,
                                query: config.query,
                                from: offset,
                                size: 96,
                                sort: [{ "lot_status_id_order": { "order": "asc" } }, { "lot_visits": { "order": "desc" } }]
                            })
                        });

                        if (!response.ok) throw new Error(`Status ${response.status}`);
                        const data = await response.json();
                        results = data.results || [];
                    } catch (apiErr) {
                        console.log(`   ⚠️ [${SITE}] API falhou (${apiErr.message}). Tentando fallback DOM...`);
                        results = await page.evaluate(() => {
                            const dom = [];
                            document.querySelectorAll('.leilao-lote-card, .card-lote').forEach(el => {
                                const l = el.querySelector('a')?.href;
                                if (l) dom.push({ lot_id: l.split('/').pop(), produto: { descricao: el.innerText.split('\n')[0] } });
                            });
                            return dom;
                        });
                    }

                    if (!results || results.length === 0) break;

                    const veiculosParaSalvar = results.map(item => {
                        const id = String(item.lot_id || item.id);
                        if (seenIds.has(id)) return null;
                        seenIds.add(id);

                        const title = (item.produto?.descricao || 'ITEM').toUpperCase();

                        // Extract rich metadata from item details if available
                        const yearMatch = title.match(/\b(19[89]\d|20[0-2]\d)\b/);
                        const isBlindado = title.includes('BLIND') || title.includes('BLIN');

                        // Sodré API usually includes category and classification
                        const condicao = item.classificacao_nome || item.lot_category_name || '';
                        const localLeilao = item.cidade_patio ? `${item.cidade_patio}/${item.uf_patio || ''}` : 'Brasil';
                        const combustivel = item.combustivel_nome || '';
                        const cor = item.cor_nome || '';

                        // Determine category (tipo)
                        let tipo = 'veiculo';
                        if (config.indices.includes('imoveis')) tipo = 'imovel';
                        else if (config.indices.includes('diversos')) tipo = 'diversos';

                        return {
                            registro: id,
                            site: SITE,
                            link: `https://www.sodresantoro.com.br/lote/${id}`,
                            veiculo: title,
                            fotos: (item.imagens || []).map(img => img.url).filter(Boolean),
                            valor: parseFloat(item.valorAtual || 0),
                            ano: item.ano_modelo || (yearMatch ? parseInt(yearMatch[1]) : null),
                            localLeilao,
                            modalidade: 'leilao',
                            tipo: tipo,
                            condicao,
                            combustivel,
                            cor,
                            blindado: isBlindado
                        };
                    }).filter(Boolean);

                    if (veiculosParaSalvar.length > 0) {
                        await db.salvarLista(veiculosParaSalvar);
                        capturados += veiculosParaSalvar.length;
                        configCapturados += veiculosParaSalvar.length;
                    }

                    if (results.length < 96) break;
                    await new Promise(r => setTimeout(r, 500));
                } catch (e) {
                    console.error(`   ❌ [${SITE}] Erro no offset ${offset}:`, e.message);
                    break;
                }
            }
            console.log(`   ✅ [${SITE}] ${config.label}: +${configCapturados} veículos.`);
        }
    } catch (e) {
        console.error(`❌ [${SITE}] Erro Fatal:`, e.message);
    } finally {
        await browser.close();
        console.log(`✅ [${SITE}] Finalizado: ${capturados} veículos.`);
    }
};

function buildQuery(statuses, categories = [1, 2, 3, 27]) {
    const statusShould = statuses.map(status => {
        if (status === 'encerrado') return { bool: { must: [{ term: { auction_status: "encerrado" } }, { terms: { lot_status_id: [6] } }] } };
        if (status === 'aberto') return { bool: { must: [{ term: { auction_status: "aberto" } }], must_not: [{ terms: { lot_status_id: [5, 7] } }] } };
        return { term: { auction_status: status } };
    });
    return { bool: { should: statusShould, minimum_should_match: 1, must: [{ terms: { category_id: categories } }] } };
}

const createCrawler = (db) => ({ buscarTodos: () => execute(db), SITE: 'sodresantoro.com.br' });
export default { execute, createCrawler };
