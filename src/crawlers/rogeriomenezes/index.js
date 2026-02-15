import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import dotenv from 'dotenv';

dotenv.config();
puppeteer.use(StealthPlugin());

const TIMEOUT = parseInt(process.env.CRAWLER_TIMEOUT_MS) || 60000;
const CONCURRENCY = 3;

const createCrawler = (db) => {
    const { salvarLista } = db;
    const SITE = 'rogeriomenezes.com.br';
    const BASE = 'https://www.rogeriomenezes.com.br';

    const crawlAuction = async (browser, auctionLink) => {
        const url = auctionLink.startsWith('http') ? auctionLink : `${BASE}${auctionLink}`;
        const page = await browser.newPage();
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36');

        const auctionVehicles = [];
        try {
            console.log(`   📋 [${idFromUrl(url)}] Acessando leilão...`);
            await page.goto(url, { waitUntil: 'networkidle2', timeout: TIMEOUT });
            await autoScroll(page);

            const items = await page.evaluate((site) => {
                const found = [];
                document.querySelectorAll('.lote-item').forEach(el => {
                    try {
                        const linkEl = el.querySelector('a.img-destaque');
                        const titulo = el.querySelector('.info h3')?.innerText.trim();
                        if (!linkEl || !titulo) return;

                        const imgEl = linkEl.querySelector('img');
                        const loteNum = el.querySelector('.lote-num strong')?.innerText.trim() || '';
                        const lance = el.querySelector('.lance-atual span')?.innerText.trim() || el.querySelector('.lance-atual')?.innerText.trim();
                        const details = Array.from(el.querySelectorAll('.info p')).map(p => p.innerText).join(' ');

                        // Condition pattern detection
                        const text = (titulo + ' ' + details).toUpperCase();
                        let cond = 'Venda Direta';
                        if (text.includes('SUCATA')) cond = 'Sucata';
                        else if (text.includes('SINISTRO') || text.includes('COLISÃO') || text.includes('BATIDO')) cond = 'Sinistrado';
                        else if (text.includes('FINANCEIRA') || text.includes('RECUPERADO')) cond = 'Recuperado de Financiamento';
                        else if (text.includes('DOCUMENTÁVEL')) cond = 'Documentável';

                        // FUZZY FILTER V2: Blacklist + Whitelist hybrid
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

                        if (isBlacklisted && !isWhitelisted) return;

                        // Only continue if it's a vehicle or explicitly mentioned as such
                        if (!isWhitelisted) {
                            const commonVehicleTerms = ['CARRO', 'CAMIONETE', 'TRAILER', 'REBOQUE', 'TRATOR'];
                            if (!commonVehicleTerms.some(t => text.includes(t))) {
                                // Double check: years are usually present in vehicle titles on RM
                                if (!text.match(/\d{4}\/\d{4}/)) return;
                            }
                        }

                        found.push({
                            site: site,
                            registro: loteNum || linkEl.href.split('/').pop(),
                            link: linkEl.href,
                            veiculo: titulo,
                            fotos: imgEl && imgEl.src && !imgEl.src.includes('sem_foto') ? [imgEl.src] : [],
                            valor: parseFloat(lance?.replace(/[^0-9,]/g, '').replace(',', '.')) || 0,
                            descricao: details,
                            localLeilao: 'RJ / MG / SP',
                            condicao: cond,
                            modalidade: 'leilao'
                        });
                    } catch (err) { }
                });
                return found;
            }, SITE);

            auctionVehicles.push(...items);
        } catch (e) {
            console.log(`   ⚠️ [${idFromUrl(url)}] Erro: ${e.message}`);
        } finally {
            await page.close();
        }
        return auctionVehicles;
    };

    const idFromUrl = (url) => url.split('/').pop();

    const buscarTodos = async () => {
        console.log(`🚀 [${SITE}] High-Yield Mode: Inicializando...`);
        const browser = await puppeteer.launch({
            headless: "new",
            protocolTimeout: 120000,
            args: [
                '--no-sandbox', '--disable-setuid-sandbox',
                '--disable-dev-shm-usage', '--disable-gpu',
                '--window-size=1280,720'
            ]
        });

        let total = 0;
        try {
            const page = await browser.newPage();
            console.log(`🔍 [${SITE}] Mapeando leilões na home e categorias...`);
            const discoveryUrls = [BASE, `${BASE}/leiloes`, `${BASE}/veiculos`];
            const auctionLinks = new Set();

            for (const dUrl of discoveryUrls) {
                try {
                    await page.goto(dUrl, { waitUntil: 'networkidle2', timeout: 30000 });
                    const found = await page.evaluate(() => {
                        const links = [];
                        document.querySelectorAll('a[href*="/leilao/"]').forEach(a => {
                            const h = a.getAttribute('href');
                            if (h && !h.includes('/lista') && h.split('/').pop().length > 2) {
                                links.push(h);
                            }
                        });
                        return links;
                    });
                    found.forEach(l => auctionLinks.add(l));
                } catch (e) { }
            }

            const linksArray = [...auctionLinks];
            console.log(`✅ [${SITE}] ${linksArray.length} leilões encontrados. Processando em paralelo...`);

            for (let i = 0; i < linksArray.length; i += CONCURRENCY) {
                const chunk = linksArray.slice(i, i + CONCURRENCY);
                const results = await Promise.all(chunk.map(link => crawlAuction(browser, link)));
                const flattened = results.flat();

                if (flattened.length > 0) {
                    await salvarLista(flattened);
                    total += flattened.length;
                }
                console.log(`   🔸 [Pool] Bloco ${i + 1}-${i + chunk.length} concluído. Total: ${total}`);
            }

        } catch (e) {
            console.error(`❌ [${SITE}] Erro Fatal: ${e.message}`);
        } finally {
            await browser.close();
        }
        return total;
    };

    return { buscarTodos, SITE };
};

async function autoScroll(page) {
    await page.evaluate(async () => {
        await new Promise((resolve) => {
            let totalHeight = 0;
            let distance = 300;
            let count = 0;
            let timer = setInterval(() => {
                let scrollHeight = document.body.scrollHeight;
                window.scrollBy(0, distance);
                totalHeight += distance;
                count++;
                // Max 150 scrolls or till end
                if (totalHeight >= scrollHeight || count > 150) {
                    clearInterval(timer);
                    resolve();
                }
            }, 150);
        });
    });
    // Wait for dynamic loads
    await new Promise(r => setTimeout(r, 2000));
}

export default createCrawler;
