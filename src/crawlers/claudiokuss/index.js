import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import { getExecutablePath, getCommonArgs, getRandomUserAgent } from '../../utils/browser.js';
import { standardizeStatus } from '../../utils/status.js';
import { classifyVehicle, parseVehicleDetails, cleanTitle } from '../../utils/vehicle-parser.js';

puppeteer.use(StealthPlugin());

const SITE = 'claudiokussleiloes.com.br';
const BASE_URL = 'https://www.claudiokussleiloes.com.br';

const createCrawler = (db) => {
    const { salvarLista } = db;

    const crawlDetails = async (page, url) => {
        try {
            await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
            await new Promise(r => setTimeout(r, 2000));

            return await page.evaluate(() => {
                const photos = [];
                document.querySelectorAll('.galeria img, .carousel-inner img, #galeriaLote img').forEach(img => {
                    const src = img.src || img.getAttribute('data-src') || img.getAttribute('data-original');
                    if (src && src.startsWith('http') && !photos.includes(src)) {
                        photos.push(src);
                    }
                });

                const v = (sel) => document.querySelector(sel)?.innerText?.trim() || '';

                const title = v('h1') || v('.titulo-lote') || v('.detalhe-lote-titulo');
                const lanceAtual = v('.lance-atual') || v('.valor-lance') || v('.info-lance h2');

                const specs = {};
                document.querySelectorAll('.detalhes-lote table tr, .infos-lote li').forEach(el => {
                    const text = el.innerText.trim();
                    if (text.includes(':')) {
                        const [key, ...vals] = text.split(':');
                        specs[key.trim()] = vals.join(':').trim();
                    }
                });

                return { photos, title, lanceAtual, specs };
            });
        } catch (e) {
            console.error(`      ⚠️ Erro nos detalhes (${url}): ${e.message}`);
            return null;
        }
    };

    const buscarTodos = async () => {
        console.log(`🚀 [${SITE}] TURBO PUPPETEER MODE: Iniciando captura...`);
        const browser = await puppeteer.launch({
            executablePath: getExecutablePath(),
            headless: 'new',
            protocolTimeout: 300000,
            args: [...getCommonArgs(), '--disable-web-security']
        });

        try {
            const page = await browser.newPage();
            await page.setUserAgent(getRandomUserAgent());
            await page.setViewport({ width: 1366, height: 768 });

            // 1. Discover Auctions
            console.log(`   🔍 [${SITE}] Descobrindo leilões ativos...`);
            await page.goto(BASE_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });

            const auctionLinks = await page.evaluate(() => {
                const links = new Set();
                document.querySelectorAll('a[href*="/leilao/"], a[href*="Leilao"]').forEach(a => {
                    if (a.href && !a.href.includes('javascript') && !a.href.includes('#')) {
                        links.add(a.href);
                    }
                });
                return Array.from(links);
            });

            console.log(`   ✅ [${SITE}] Encontrados ${auctionLinks.length} possíveis links de leilões.`);

            let totalCapturados = 0;
            const seenIds = new Set();

            for (const auctionLink of auctionLinks) {
                console.log(`   🔄 [${SITE}] Explorando leilão: ${auctionLink}`);
                try {
                    await page.goto(auctionLink, { waitUntil: 'domcontentloaded', timeout: 45000 });
                    await new Promise(r => setTimeout(r, 2000));

                    // Load More if exists
                    for (let i = 0; i < 5; i++) {
                        const clicked = await page.evaluate(() => {
                            const btn = Array.from(document.querySelectorAll('button, a')).find(el =>
                                el.innerText.toUpperCase().includes('CARREGAR MAIS') ||
                                el.innerText.toUpperCase().includes('VER MAIS')
                            );
                            if (btn && btn.offsetParent !== null) {
                                btn.click();
                                return true;
                            }
                            return false;
                        });
                        if (!clicked) break;
                        await new Promise(r => setTimeout(r, 1500));
                    }

                    const lotLinks = await page.evaluate(() => {
                        const links = new Set();
                        document.querySelectorAll('a[href*="/lote/"], a[href*="Lote"]').forEach(a => {
                            if (a.href && !a.href.includes('javascript')) links.add(a.href);
                        });
                        return Array.from(links);
                    });

                    console.log(`      💎 [${SITE}] Encontrados ${lotLinks.length} lotes.`);

                    for (const lotLink of lotLinks) {
                        const registro = lotLink.split('/').pop() || lotLink.split('=').pop();
                        if (seenIds.has(registro)) continue;
                        seenIds.add(registro);

                        const details = await crawlDetails(page, lotLink);
                        if (details && details.photos.length > 0) {
                            const item = {
                                site: SITE,
                                registro,
                                link: lotLink,
                                veiculo: cleanTitle(details.title || ''),
                                fotos: details.photos,
                                valor: parseFloat(details.lanceAtual?.replace(/[^0-9,]/g, '').replace(',', '.') || 0),
                                modalidade: 'leilao'
                            };

                            const s = details.specs;
                            const parsed = parseVehicleDetails(item.veiculo + ' ' + Object.values(s).join(' '), s);

                            item.ano = parsed.ano;
                            item.tipo = classifyVehicle(item.veiculo);
                            item.cor = s['Cor'] || s['COR'];
                            item.combustivel = s['Combustível'] || s['COMBUSTÍVEL'];
                            item.km = parsed.km;
                            item.cambio = s['Câmbio'] || s['CÂMBIO'];
                            item.blindado = parsed.blindado;
                            item.condicao = parsed.condicao;
                            item.situacao = standardizeStatus('Disponível');

                            await salvarLista([item]);
                            totalCapturados++;
                            console.log(`      ✅ [${SITE}] +1: ${item.veiculo} (Total: ${totalCapturados})`);
                        }
                    }
                } catch (e) {
                    console.error(`      ❌ Erro no leilão ${auctionLink}: ${e.message}`);
                }
            }

            console.log(`✅ [${SITE}] Finalizado! ${totalCapturados} itens coletados.`);
            return totalCapturados;
        } finally {
            await browser.close();
        }
    };

    return { buscarTodos };
};

export default createCrawler;
