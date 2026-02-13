import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import dotenv from 'dotenv';
import connectDatabase from '../../database/db.js';

dotenv.config();
puppeteer.use(StealthPlugin());

let db;

export const execute = async (database) => {
    db = database;
    const SITE = 'sodresantoro.com.br';
    console.log(`🚀 [${SITE}] HIGH-YIELD: Iniciando captura via API Intercept...`);

    const browser = await puppeteer.launch({
        headless: "new",
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--window-size=1920,1080']
    });

    let capturados = 0;
    try {
        const page = await browser.newPage();
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36');

        // Capture API responses
        page.on('request', request => {
            if (request.url().includes('api/search-lots')) {
                console.log(`   📡 [${SITE}] API Request:`, request.url());
                if (request.method() === 'POST') {
                    console.log(`   📦 [${SITE}] Payload:`, request.postData());
                }
            }
        });

        page.on('response', async response => {
            const url = response.url();
            if (url.includes('api/search-lots')) {
                try {
                    const data = await response.json();
                    if (data && data.results && Array.isArray(data.results)) {
                        const veiculos = data.results.map(item => {
                            const link = `https://www.sodresantoro.com.br/leilao/${item.auction_id}/lote/${item.lot_id}`;
                            return {
                                registro: String(item.lot_id || item.id),
                                site: SITE,
                                link: link,
                                veiculo: item.lot_title || item.lot_description || 'Veículo Sodré',
                                fotos: item.lot_pictures || [],
                                valor: parseFloat(item.bid_actual || item.bid_initial || 0),
                                modalidade: 'leilao',
                                localLeilao: item.lot_location || item.lot_location_address || 'Ver Site',
                                ano: item.lot_year_manufacture ? `${item.lot_year_manufacture}/${item.lot_year_model}` : item.lot_year_model,
                                previsao: { string: item.lot_date_end || '' },
                                tipo: 'veiculo'
                            };
                        }).filter(v => {
                            if (v.fotos.length === 0) return false;

                            // FUZZY FILTER V2
                            const text = (v.veiculo + ' ' + (v.ano || '')).toUpperCase();
                            const blacklist = [
                                'MOVEIS', 'ELETRO', 'INFORMÁTICA', 'SUCATA DE FERRO', 'PEÇAS', 'TELEVISAO', 'CELULAR',
                                'CADEIRA', 'MESA', 'ARMARIO', 'GELADEIRA', 'FOGAO', 'MACBOOK', 'IPHONE', 'NOTEBOOK',
                                'MONITOR', 'BEBEDOURO', 'SOFA', 'ROUPAS', 'CALCADOS', 'BOLSAS', 'BRINQUEDOS',
                                'IMOVEL', 'IMOVEIS', 'CASA', 'APARTAMENTO', 'TERRENO', 'SITIO', 'FAZENDA', 'GALPAO',
                                'MATERIAL', 'FERRAGENS', 'SUCATA DE BENS', 'ESCRITORIO', 'EQUIPAMENTO', 'MAQUINAS'
                            ];
                            const whitelist = ['AUTOMOVEL', 'VEICULO', 'PICKUP', 'CAMINHAO', 'MOTO', 'MOTOCICLETA', 'ONIBUS', 'VAN', 'UTILITARIO'];

                            const isBlacklisted = blacklist.some(b => text.includes(b));
                            const isWhitelisted = whitelist.some(w => text.includes(w));

                            if (isBlacklisted && !isWhitelisted) return false;
                            return true;
                        });

                        if (veiculos.length > 0) {
                            await db.salvarLista(veiculos);
                            capturados += veiculos.length;
                            console.log(`   🔸 [${SITE}] Capturados ${veiculos.length} itens do chunk API.`);
                        }
                    }
                } catch (e) { }
            }
        });

        const targetUrl = 'https://www.sodresantoro.com.br/veiculos/lotes?sort=lot_visits_desc';
        console.log(`🔍 [${SITE}] Abrindo listagem...`);
        await page.goto(targetUrl, { waitUntil: 'networkidle2', timeout: 60000 });

        // Force Pagination via direct API calls inside the page context
        console.log(`🚀 [${SITE}] Ativando Turbo-Pagination via API...`);
        for (let offset = 48; offset < 2000; offset += 48) {
            const newLots = await page.evaluate(async (from) => {
                try {
                    const response = await fetch('https://www.sodresantoro.com.br/api/search-lots', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            indices: ["veiculos", "judiciais-veiculos"],
                            query: { bool: { filter: [{ bool: { should: [{ bool: { must: [{ term: { auction_status: "online" } }] } }, { bool: { must: [{ term: { auction_status: "aberto" } }], must_not: [{ terms: { lot_status_id: [5, 7] } }] } }, { bool: { must: [{ term: { auction_status: "encerrado" } }, { terms: { lot_status_id: [6] } }] } }], minimum_should_match: 1 } }, { bool: { should: [{ bool: { must_not: { term: { lot_status_id: 6 } } } }, { bool: { must: [{ term: { lot_status_id: 6 } }, { term: { segment_id: 1 } }] } }], minimum_should_match: 1 } }, { bool: { should: [{ bool: { must_not: [{ term: { lot_test: true } }] } }], minimum_should_match: 1 } }] } },
                            from: from,
                            size: 48,
                            sort: [{ lot_status_id_order: { order: "asc" } }, { lot_visits: { order: "desc" } }]
                        })
                    });
                    const data = await response.json();
                    return data.results || [];
                } catch (e) { return []; }
            }, offset);

            if (newLots.length === 0) break;

            const veiculos = newLots.map(item => {
                const link = `https://www.sodresantoro.com.br/leilao/${item.auction_id}/lote/${item.lot_id}`;
                return {
                    registro: String(item.lot_id || item.id),
                    site: SITE,
                    link: link,
                    veiculo: item.lot_title || item.lot_description || 'Veículo Sodré',
                    fotos: item.lot_pictures || [],
                    valor: parseFloat(item.bid_actual || item.bid_initial || 0),
                    modalidade: 'leilao',
                    localLeilao: item.lot_location || item.lot_location_address || 'Ver Site',
                    ano: item.lot_year_manufacture ? `${item.lot_year_manufacture}/${item.lot_year_model}` : item.lot_year_model,
                    previsao: { string: item.lot_date_end || '' },
                    tipo: 'veiculo'
                };
            }).filter(v => v.fotos.length > 0);

            if (veiculos.length > 0) {
                await db.salvarLista(veiculos);
                capturados += veiculos.length;
                console.log(`   🔸 [${SITE}] Turbo-Mode: +${veiculos.length} veículos (Offset: ${offset}). Total: ${capturados}`);
            }
            await new Promise(r => setTimeout(r, 1000));
        }

    } catch (e) {
        console.error(`❌ [${SITE}] Erro:`, e.message);
    } finally {
        await browser.close();
        console.log(`✅ [${SITE}] Coleção finalizada: ${capturados} veículos encontrados.`);
    }
};

if (process.argv[1].includes('sodre')) {
    (async () => {
        const conn = await connectDatabase();
        await execute(conn);
        process.exit(0);
    })();
}

export default { execute };
