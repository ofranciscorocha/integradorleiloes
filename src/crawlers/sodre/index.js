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

        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36');

        const targetUrl = 'https://www.sodresantoro.com.br/';
        console.log(`   🔍 [${SITE}] Estabelecendo sessão...`);

        let pageLoaded = false;
        for (let attempt = 1; attempt <= 3; attempt++) {
            try {
                await page.goto(targetUrl, { waitUntil: 'networkidle2', timeout: TIMEOUT });
                try {
                    console.log(`   ⏳ [${SITE}] Aguardando desafio WAF (até 60s)...`);
                    await page.waitForSelector('footer, #header, nav', { timeout: 60000 });
                } catch (e) {
                    console.log(`   ⚠️ [${SITE}] Timeout esperando elemento da home.`);
                }
                await new Promise(r => setTimeout(r, 3000));
                pageLoaded = true;
                console.log(`   ✅ [${SITE}] Sessão estabelecida.`);
                break;
            } catch (e) {
                console.log(`   ⚠️ [${SITE}] Tentativa ${attempt}/3 falhou: ${e.message}`);
                if (attempt === 3) throw e;
                await new Promise(r => setTimeout(r, 5000));
            }
        }

        if (!pageLoaded) throw new Error('Não foi possível carregar a página');

        const searchConfigs = [
            { label: 'Veículos + Judiciais', indices: ["veiculos", "judiciais-veiculos"], query: buildQuery(["online", "aberto", "encerrado", "programado"]) },
            { label: 'Venda Direta', indices: ["venda-direta"], query: buildQuery(["online", "aberto", "programado"]) },
            { label: 'Veículos Leilão', indices: ["veiculos"], query: buildQuery(["online", "aberto", "encerrado", "programado"]) },
            { label: 'Judiciais', indices: ["judiciais-veiculos"], query: buildQuery(["online", "aberto", "encerrado", "programado"]) }
        ];

        const seenIds = new Set();
        for (const config of searchConfigs) {
            console.log(`   📋 [${SITE}] Índice: ${config.label}`);
            let configCapturados = 0;

            for (let offset = 0; offset < 20000; offset += 96) {
                try {
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
                                'Referer': 'https://www.sodresantoro.com.br/',
                                'User-Agent': userAgent,
                                'Cookie': cookieStr
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
                        return {
                            registro: id,
                            site: SITE,
                            link: `https://www.sodresantoro.com.br/lote/${id}`,
                            veiculo: (item.produto?.descricao || 'VEÍCULO').toUpperCase(),
                            fotos: (item.imagens || []).map(img => img.url).filter(Boolean),
                            valor: parseFloat(item.valorAtual || 0),
                            ano: null,
                            localLeilao: 'Brasil',
                            modalidade: 'leilao',
                            tipo: 'veiculo'
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

function buildQuery(statuses) {
    const statusShould = statuses.map(status => {
        if (status === 'encerrado') return { bool: { must: [{ term: { auction_status: "encerrado" } }, { terms: { lot_status_id: [6] } }] } };
        if (status === 'aberto') return { bool: { must: [{ term: { auction_status: "aberto" } }], must_not: [{ terms: { lot_status_id: [5, 7] } }] } };
        return { term: { auction_status: status } };
    });
    return { bool: { should: statusShould, minimum_should_match: 1, must: [{ terms: { category_id: [1, 2, 3, 27] } }] } };
}

const createCrawler = (db) => ({ buscarTodos: () => execute(db), SITE: 'sodresantoro.com.br' });
export default { execute, createCrawler };
