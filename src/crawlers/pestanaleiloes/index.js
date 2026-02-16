import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import dotenv from 'dotenv';
import { getExecutablePath, getCommonArgs } from '../../utils/browser.js';

dotenv.config();
puppeteer.use(StealthPlugin());

const SITE = 'pestanaleiloes.com.br';
const BASE_URL = 'https://www.pestanaleiloes.com.br';
const API_BASE = 'https://api.pestanaleiloes.com.br';

const createCrawler = (db) => {
    const { salvarLista } = db;

    const buscarTodos = async () => {
        console.log(`🚀 [${SITE}] SUPERCRAWLER: Iniciando captura via API...`);

        const browser = await puppeteer.launch({
            executablePath: getExecutablePath(),
            headless: true,
            protocolTimeout: 240000,
            args: getCommonArgs()
        });

        let totalVeiculos = 0;
        const seenIds = new Set();

        try {
            const page = await browser.newPage();
            await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36');

            // Navigate to site to establish session
            console.log(`   🔍 [${SITE}] Estabelecendo sessão...`);
            await page.goto(BASE_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
            await new Promise(r => setTimeout(r, 3000));

            // STEP 1: Get auction agenda via API
            console.log(`   📋 [${SITE}] Buscando agenda de leilões via API...`);
            const agenda = await page.evaluate(async (apiBase) => {
                try {
                    const headers = {
                        'Accept': 'application/json, text/plain, */*',
                        'Origin': 'https://www.pestanaleiloes.com.br',
                        'Referer': 'https://www.pestanaleiloes.com.br/',
                        'User-Agent': navigator.userAgent
                    };

                    const fetchWithTimeout = (url, opts = {}) => {
                        const controller = new AbortController();
                        const id = setTimeout(() => controller.abort(), 30000);
                        return fetch(url, { ...opts, signal: controller.signal })
                            .then(r => { clearTimeout(id); return r; })
                            .catch(e => { clearTimeout(id); throw e; });
                    };

                    const resp = await fetchWithTimeout(`${apiBase}/api/v2/leilao/agenda`, { headers });
                    return await resp.json();
                } catch (e) { return []; }
            }, API_BASE);

            // Get all auction IDs from agenda
            const allAuctionIds = [];
            if (Array.isArray(agenda)) {
                agenda.forEach(entry => {
                    if (entry.auctions && Array.isArray(entry.auctions)) {
                        entry.auctions.forEach(id => {
                            if (!allAuctionIds.includes(id)) allAuctionIds.push(id);
                        });
                    }
                });
            }

            console.log(`   ✅ [${SITE}] ${allAuctionIds.length} leilões encontrados na agenda`);

            // STEP 2: For each auction, get lots via API
            for (const auctionId of allAuctionIds) {
                try {
                    console.log(`   🔄 [${SITE}] Processando leilão ${auctionId}...`);

                    // Try to get auction details and lots
                    const auctionData = await page.evaluate(async (apiBase, aId) => {
                        try {
                            const headers = {
                                'Accept': 'application/json, text/plain, */*',
                                'Origin': 'https://www.pestanaleiloes.com.br',
                                'Referer': 'https://www.pestanaleiloes.com.br/',
                                'User-Agent': navigator.userAgent
                            };

                            const fetchWithTimeout = (url, opts = {}) => {
                                const controller = new AbortController();
                                const id = setTimeout(() => controller.abort(), 30000);
                                return fetch(url, { ...opts, signal: controller.signal })
                                    .then(r => { clearTimeout(id); return r; })
                                    .catch(e => { clearTimeout(id); throw e; });
                            };

                            // Get auction details
                            const detailResp = await fetchWithTimeout(`${apiBase}/api/v2/leilao/${aId}`, { headers });
                            const detail = detailResp.ok ? await detailResp.json() : null;

                            // Get lots for this auction
                            const lotesResp = await fetchWithTimeout(`${apiBase}/api/v2/leilao/${aId}/lotes`, { headers });
                            const lotes = lotesResp.ok ? await lotesResp.json() : [];

                            // Also try alternate endpoint
                            let lotes2 = [];
                            try {
                                const resp2 = await fetchWithTimeout(`${apiBase}/api/v2/lote?leilaoId=${aId}&pageSize=200&page=1`, { headers });
                                if (resp2.ok) {
                                    const data2 = await resp2.json();
                                    lotes2 = Array.isArray(data2) ? data2 : (data2.data || data2.items || data2.content || []);
                                }
                            } catch (e) { }

                            return { detail, lotes: Array.isArray(lotes) ? lotes : (lotes.data || lotes.items || lotes.content || []), lotes2 };
                        } catch (e) { return { error: e.message }; }
                    }, API_BASE, auctionId);

                    if (auctionData.error) {
                        console.log(`      ⚠️ [${SITE}] Erro leilão ${auctionId}: ${auctionData.error}`);
                        continue;
                    }

                    // Process lots from both sources
                    const allLots = [...(auctionData.lotes || []), ...(auctionData.lotes2 || [])];
                    const auctionDetail = auctionData.detail || {};

                    // Skip non-vehicle auctions
                    const auctionTitle = (auctionDetail.titulo || auctionDetail.nome || auctionDetail.descricao || '').toLowerCase();
                    if (auctionTitle.includes('imóve') || auctionTitle.includes('imovel') || auctionTitle.includes('imóv')) {
                        console.log(`      ⏭️ [${SITE}] Leilão ${auctionId} é imóveis, ignorando.`);
                        continue;
                    }

                    const veiculos = allLots.map(lote => parseLote(lote, auctionDetail)).filter(Boolean);

                    // Deduplicate
                    const newVeiculos = veiculos.filter(v => {
                        if (seenIds.has(v.registro)) return false;
                        seenIds.add(v.registro);
                        return true;
                    });

                    if (newVeiculos.length > 0) {
                        await salvarLista(newVeiculos);
                        totalVeiculos += newVeiculos.length;
                        console.log(`      ✅ [${SITE}] Leilão ${auctionId}: +${newVeiculos.length} veículos. Total: ${totalVeiculos}`);
                    }

                    await new Promise(r => setTimeout(r, 300));
                } catch (e) {
                    console.log(`      ⚠️ [${SITE}] Erro processando leilão ${auctionId}: ${e.message}`);
                }
            }

            // STEP 3: Try direct lotes search API
            if (totalVeiculos < 50) {
                console.log(`   🔄 [${SITE}] Tentando busca direta de lotes via API...`);

                for (let pageNum = 1; pageNum <= 50; pageNum++) {
                    const lotes = await page.evaluate(async (apiBase, p) => {
                        try {
                            const headers = {
                                'Accept': 'application/json, text/plain, */*',
                                'Origin': 'https://www.pestanaleiloes.com.br',
                                'Referer': 'https://www.pestanaleiloes.com.br/',
                                'User-Agent': navigator.userAgent
                            };

                            const fetchWithTimeout = (url, opts = {}) => {
                                const controller = new AbortController();
                                const id = setTimeout(() => controller.abort(), 30000);
                                return fetch(url, { ...opts, signal: controller.signal })
                                    .then(r => { clearTimeout(id); return r; })
                                    .catch(e => { clearTimeout(id); throw e; });
                            };

                            // Try various endpoints for lot search
                            const endpoints = [
                                `${apiBase}/api/v2/lote?tipoBemId=421&pageSize=50&page=${p}`,
                                `${apiBase}/api/v2/lote/pesquisa?tipoBemId=421&pageSize=50&page=${p}`,
                                `${apiBase}/api/v2/lote?page=${p}&pageSize=50`
                            ];

                            for (const url of endpoints) {
                                try {
                                    const resp = await fetchWithTimeout(url, { headers });
                                    if (resp.ok) {
                                        const data = await resp.json();
                                        const items = Array.isArray(data) ? data : (data.data || data.items || data.content || data.lotes || []);
                                        if (items.length > 0) return items;
                                    }
                                } catch (e) { }
                            }
                            return [];
                        } catch (e) { return []; }
                    }, API_BASE, pageNum);

                    if (!lotes || lotes.length === 0) break;

                    const veiculos = lotes.map(l => parseLote(l, {})).filter(Boolean);
                    const newVeiculos = veiculos.filter(v => {
                        if (seenIds.has(v.registro)) return false;
                        seenIds.add(v.registro);
                        return true;
                    });

                    if (newVeiculos.length > 0) {
                        await salvarLista(newVeiculos);
                        totalVeiculos += newVeiculos.length;
                        console.log(`      ✅ [${SITE}] Busca direta página ${pageNum}: +${newVeiculos.length}. Total: ${totalVeiculos}`);
                    }

                    await new Promise(r => setTimeout(r, 300));
                }
            }

            // STEP 4: Navigate to individual auction pages and scrape DOM
            if (totalVeiculos < 20) {
                console.log(`   🔄 [${SITE}] Tentando navegação para páginas de leilões...`);

                for (const auctionId of allAuctionIds.slice(0, 15)) {
                    try {
                        await page.goto(`${BASE_URL}/leilao/${auctionId}`, { waitUntil: 'networkidle2', timeout: 60000 });
                        await new Promise(r => setTimeout(r, 3000));

                        // Scroll
                        for (let i = 0; i < 10; i++) {
                            await page.evaluate(() => window.scrollBy(0, 600));
                            await new Promise(r => setTimeout(r, 500));
                        }

                        const domVeiculos = await page.evaluate((siteDomain) => {
                            const items = [];
                            // Find lot cards
                            const cards = document.querySelectorAll('[class*="lote"], [class*="card"], [class*="item"]');

                            cards.forEach(card => {
                                const text = (card.textContent || '').trim();
                                if (text.length < 20 || text.length > 5000) return;

                                const linkEl = card.querySelector('a');
                                const imgEl = card.querySelector('img');
                                const titleEl = card.querySelector('h2, h3, h4, h5, [class*="titulo"], [class*="nome"], [class*="descricao"]');

                                let veiculo = titleEl ? titleEl.textContent.trim() : '';
                                if (!veiculo || veiculo.length < 3) return;

                                // Vehicle check
                                const vehicleKeywords = /\b(veículo|veiculo|auto|carro|moto|caminhão|caminhao|van|onibus|pickup)\b/i;
                                const brandNames = /\b(honda|toyota|fiat|volkswagen|chevrolet|ford|yamaha|hyundai|renault|jeep|bmw|mercedes|nissan|kia|peugeot)\b/i;
                                if (!vehicleKeywords.test(text) && !brandNames.test(text)) return;

                                // Skip real estate
                                if (/\b(casa|apartamento|terreno|imovel|imóvel|sala|loja|galpão)\b/i.test(veiculo)) return;

                                const priceMatch = text.match(/R\$\s?[\d.,]+/);
                                const yearMatch = text.match(/\b(19[89]\d|20[0-2]\d)\b/);

                                items.push({
                                    site: siteDomain,
                                    registro: (linkEl?.href || '').split('/').filter(Boolean).pop() || String(Math.random()).slice(2, 10),
                                    link: linkEl?.href || '',
                                    veiculo: veiculo.substring(0, 120).toUpperCase(),
                                    fotos: imgEl ? [imgEl.src || imgEl.getAttribute('data-src') || ''].filter(Boolean) : [],
                                    valor: priceMatch ? parseFloat(priceMatch[0].replace('R$', '').replace(/\./g, '').replace(',', '.')) : 0,
                                    ano: yearMatch ? parseInt(yearMatch[0]) : null,
                                    modalidade: 'leilao',
                                    tipo: 'veiculo'
                                });
                            });

                            // Deduplicate by link
                            const unique = [];
                            const seen = new Set();
                            items.forEach(i => { if (!seen.has(i.link)) { seen.add(i.link); unique.push(i); } });
                            return unique;
                        }, SITE);

                        const newDom = domVeiculos.filter(v => {
                            if (seenIds.has(v.registro)) return false;
                            seenIds.add(v.registro);
                            return true;
                        });

                        if (newDom.length > 0) {
                            await salvarLista(newDom);
                            totalVeiculos += newDom.length;
                            console.log(`      ✅ [${SITE}] DOM leilão ${auctionId}: +${newDom.length}. Total: ${totalVeiculos}`);
                        }
                    } catch (e) {
                        console.log(`      ⚠️ [${SITE}] Erro DOM leilão ${auctionId}: ${e.message}`);
                    }
                }
            }

            console.log(`✅ [${SITE}] Finalizado! ${totalVeiculos} veículos coletados.`);
            return totalVeiculos;

        } catch (e) {
            console.error(`❌ [${SITE}] Erro:`, e.message);
            return 0;
        } finally {
            await browser.close();
        }
    };

    return { buscarTodos, SITE };
};

/**
 * Parse a lot object into standardized vehicle format
 */
function parseLote(lote, parent) {
    let veiculo = '';
    if (lote.marca && lote.modelo) {
        veiculo = `${lote.marca} ${lote.modelo}`;
    } else if (lote.descricao) {
        veiculo = lote.descricao.substring(0, 120);
    } else if (lote.titulo) {
        veiculo = lote.titulo;
    } else if (lote.nome) {
        veiculo = lote.nome;
    } else if (lote.veiculo) {
        veiculo = lote.veiculo;
    }

    if (!veiculo || veiculo.length < 3) return null;

    // Skip real estate
    if (/\b(casa|apartamento|terreno|imovel|imóvel|sala|loja|galpão|galpao|fazenda|sitio|sítio)\b/i.test(veiculo)) {
        return null;
    }

    // Build photo array
    const fotos = [];
    if (lote.foto) fotos.push(lote.foto);
    if (lote.imagem) fotos.push(lote.imagem);
    if (lote.urlImagem) fotos.push(lote.urlImagem);
    if (lote.urlFoto) fotos.push(lote.urlFoto);
    if (lote.imagemPrincipal) fotos.push(lote.imagemPrincipal);
    if (lote.fotos && Array.isArray(lote.fotos)) {
        lote.fotos.forEach(f => {
            if (typeof f === 'string') fotos.push(f);
            else if (f.url) fotos.push(f.url);
            else if (f.urlImagem) fotos.push(f.urlImagem);
        });
    }
    if (lote.imagens && Array.isArray(lote.imagens)) {
        lote.imagens.forEach(f => {
            if (typeof f === 'string') fotos.push(f);
            else if (f.url) fotos.push(f.url);
            else if (f.original) fotos.push(f.original);
        });
    }

    // Also check in bens (nested structure)
    if (lote.bens && Array.isArray(lote.bens)) {
        lote.bens.forEach(bem => {
            if (bem.imagens && Array.isArray(bem.imagens)) {
                bem.imagens.forEach(f => {
                    if (typeof f === 'string') fotos.push(f);
                    else if (f.url) fotos.push(f.url);
                    else if (f.original) fotos.push(f.original);
                });
            }
        });
    }

    // Debug first few items
    if (Math.random() < 0.05) {
        console.log('DEBUG PARSE LOTE FULL:', JSON.stringify(lote, null, 2));
    }

    const fotosNorm = fotos
        .filter(Boolean)
        .map(f => {
            if (f.startsWith('http')) return f;
            // Add /ged/ path if missing
            return `https://ged.pestanaleiloes.com.br/ged/${f}`;
        })
        .filter(f => !f.includes('tarja_retirado') && !f.includes('logo-traco') && !f.includes('header-logo'))
        .filter((v, i, a) => a.indexOf(v) === i);

    const registro = String(lote.id || lote.loteId || lote.codigo || lote.numero || Math.random().toString(36).slice(2, 10));
    let link = lote.url || (lote.id ? `${BASE_URL}/leilao/lote/${lote.id}` : `${BASE_URL}/leilao/${registro}`);
    if (!link.startsWith('http')) link = `${BASE_URL}${link}`;

    return {
        site: SITE,
        registro,
        link,
        veiculo: veiculo.toUpperCase().trim(),
        ano: parseInt(lote.ano || lote.anoModelo || lote.anoFabricacao) || null,
        valor: parseFloat(lote.valor || lote.valorInicial || lote.lanceInicial || lote.lanceAtual || 0) || 0,
        modalidade: 'leilao',
        tipo: 'veiculo',
        fotos: fotosNorm,
        placa: lote.placa || undefined,
        localLeilao: lote.local || lote.cidade || parent?.local || parent?.cidade || 'Brasil'
    };
}

export default createCrawler;
