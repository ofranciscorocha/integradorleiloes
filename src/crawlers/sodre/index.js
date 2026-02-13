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
    console.log(`🚀 [${SITE}] SUPERCRAWLER: Iniciando captura massiva via API...`);

    const browser = await puppeteer.launch({
        headless: "new",
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--window-size=1920,1080', '--disable-dev-shm-usage']
    });

    let capturados = 0;
    try {
        const page = await browser.newPage();
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36');

        // Capture initial API responses from page load
        const initialCapture = [];
        page.on('response', async response => {
            const url = response.url();
            if (url.includes('api/search-lots')) {
                try {
                    const data = await response.json();
                    if (data && data.results && Array.isArray(data.results)) {
                        const veiculos = processResults(data.results, SITE);
                        if (veiculos.length > 0) {
                            await db.salvarLista(veiculos);
                            capturados += veiculos.length;
                            console.log(`   🔸 [${SITE}] Capturados ${veiculos.length} itens do chunk API inicial. Total: ${capturados}`);
                        }
                    }
                } catch (e) { }
            }
        });

        const targetUrl = 'https://www.sodresantoro.com.br/veiculos/lotes?sort=lot_visits_desc';
        console.log(`   🔍 [${SITE}] Estabelecendo sessão...`);
        await page.goto(targetUrl, { waitUntil: 'networkidle2', timeout: 90000 });
        await new Promise(r => setTimeout(r, 3000));

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

            for (let offset = 0; offset < 20000; offset += 96) {
                try {
                    const newLots = await page.evaluate(async (searchConfig, from) => {
                        try {
                            const response = await fetch('https://www.sodresantoro.com.br/api/search-lots', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({
                                    indices: searchConfig.indices,
                                    query: searchConfig.query,
                                    from: from,
                                    size: 96,
                                    sort: [
                                        { lot_status_id_order: { order: "asc" } },
                                        { lot_visits: { order: "desc" } }
                                    ]
                                })
                            });
                            const data = await response.json();
                            return { results: data.results || [], total: data.total || 0 };
                        } catch (e) { return { results: [], total: 0 }; }
                    }, config, offset);

                    if (newLots.results.length === 0) {
                        console.log(`   🔸 [${SITE}] ${config.label} - Fim no offset ${offset}`);
                        break;
                    }

                    // Filter out already seen
                    const newResults = newLots.results.filter(item => {
                        const id = String(item.lot_id || item.id);
                        if (seenIds.has(id)) return false;
                        seenIds.add(id);
                        return true;
                    });

                    const veiculos = processResults(newResults, SITE);

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
        // RELAXED FILTER - Accept vehicles even without photos
        const text = (v.veiculo + ' ' + (v.ano || '')).toUpperCase();
        const blacklist = [
            'MOVEIS', 'ELETRO', 'INFORMÁTICA', 'SUCATA DE FERRO', 'TELEVISAO', 'CELULAR',
            'CADEIRA', 'MESA', 'ARMARIO', 'GELADEIRA', 'FOGAO', 'MACBOOK', 'IPHONE', 'NOTEBOOK',
            'MONITOR', 'BEBEDOURO', 'SOFA', 'ROUPAS', 'CALCADOS', 'BOLSAS', 'BRINQUEDOS',
            'IMOVEL', 'IMOVEIS', 'CASA', 'APARTAMENTO', 'TERRENO', 'SITIO', 'FAZENDA', 'GALPAO',
            'MATERIAL', 'FERRAGENS', 'SUCATA DE BENS', 'ESCRITORIO'
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

if (process.argv[1].includes('sodre')) {
    (async () => {
        const conn = await connectDatabase();
        await execute(conn);
        process.exit(0);
    })();
}

export default { execute, createCrawler };
