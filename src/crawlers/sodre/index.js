
import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import { getExecutablePath, getCommonArgs, getRandomUserAgent } from '../../utils/browser.js';

puppeteer.use(StealthPlugin());
import { standardizeStatus } from '../../utils/status.js';
import { classifyVehicle } from '../../utils/vehicle-parser.js';

const SITE = 'sodresantoro.com.br';
const BASE_URL = 'https://www.sodresantoro.com.br';

const createCrawler = (db) => {
    const { salvarLista } = db;

    const execute = async () => {
        console.log(`🚀 [${SITE}] TURBO API MODE: Iniciando captura massiva...`);

        const browser = await puppeteer.launch({
            executablePath: getExecutablePath(),
            headless: 'new',
            args: [...getCommonArgs(), '--disable-web-security']
        });

        let totalCapturados = 0;
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

            console.log(`   🔍 [${SITE}] Estabelecendo sessão...`);
            let sessionOk = false;
            for (let i = 0; i < 3; i++) {
                try {
                    await page.goto(BASE_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
                    await page.waitForSelector('footer', { timeout: 20000 });
                    sessionOk = true;
                    break;
                } catch (e) {
                    console.log(`      ⚠️ Tentativa ${i + 1} de sessão falhou.`);
                    await new Promise(r => setTimeout(r, 5000));
                }
            }

            if (!sessionOk) {
                console.error(`   ❌ [${SITE}] Não foi possível estabelecer sessão (WAF).`);
                return 0;
            }

            const searchConfigs = [
                { id: 'veiculos', indices: ["veiculos", "judiciais-veiculos"], categories: [1, 2, 3, 27] },
                { id: 'imoveis', indices: ["imoveis"], categories: [4] }
            ];

            const seenIds = new Set();
            for (const config of searchConfigs) {
                console.log(`   📋 [${SITE}] Capturando: ${config.id}...`);

                for (let offset = 0; offset < 5000; offset += 96) {
                    try {
                        const response = await page.evaluate(async (indices, categories, offset) => {
                            try {
                                const resp = await fetch('https://www.sodresantoro.com.br/api/search-lots', {
                                    method: 'POST',
                                    headers: {
                                        'Content-Type': 'application/json',
                                        'X-Requested-With': 'XMLHttpRequest'
                                    },
                                    body: JSON.stringify({
                                        indices: indices,
                                        query: { bool: { must: [{ terms: { category_id: categories } }] } },
                                        from: offset,
                                        size: 96,
                                        sort: [{ "lot_status_id_order": { "order": "asc" } }]
                                    })
                                });
                                return await resp.json();
                            } catch (e) { return { error: e.message }; }
                        }, config.indices, config.categories, offset);

                        if (!response || response.error || !response.results || response.results.length === 0) {
                            console.log(`      🔸 [${config.id}] Fim ou erro no offset ${offset}`);
                            break;
                        }

                        const items = response.results.map(item => {
                            const id = String(item.lot_id || item.id);
                            if (seenIds.has(id)) return null;
                            seenIds.add(id);

                            const fotos = (item.imagens || []).map(img => img.url).filter(Boolean);
                            if (fotos.length === 0) return null; // Skip items without photos

                            const veiculoNome = (item.produto?.descricao || 'ITEM').toUpperCase();

                            return {
                                registro: id,
                                site: SITE,
                                link: `https://www.sodresantoro.com.br/lote/${id}`,
                                veiculo: veiculoNome,
                                fotos: fotos,
                                valor: parseFloat(item.valorAtual || 0),
                                ano: item.ano_modelo || null,
                                localLeilao: item.cidade_patio ? `${item.cidade_patio}/${item.uf_patio || ''}` : 'Brasil',
                                modalidade: 'leilao',
                                tipo: classifyVehicle(veiculoNome), // Use classifyVehicle for 'tipo'
                                situacao: standardizeStatus(item.status_nome || item.lot_status_id_order_name || ''),
                                cor: item.cor_nome,
                                combustivel: item.combustivel_nome,
                                blindado: (item.produto?.descricao || '').includes('BLINDADO'),
                                km: item.kilometro_rodado ? parseInt(String(item.kilometro_rodado).replace(/[^0-9]/g, '')) : null
                            };
                        }).filter(item => item); // Filter out nulls from the map

                        if (items.length > 0) {
                            await salvarLista(items);
                            totalCapturados += items.length;
                            console.log(`      ✅ [${config.id}] offset ${offset}: +${items.length} novos (Total: ${totalCapturados})`);
                        }

                        if (response.results.length < 96) break;
                        await new Promise(r => setTimeout(r, 1000));
                    } catch (err) {
                        console.error(`      ❌ Erro no offset ${offset}: ${err.message}`);
                    }
                }
            }

        } catch (error) {
            console.error(`❌ [${SITE}] Erro Fatal:`, error.message);
        } finally {
            await browser.close();
        }
        return totalCapturados;
    };

    return { buscarTodos: execute };
};

export default createCrawler;
