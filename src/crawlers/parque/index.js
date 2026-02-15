import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import dotenv from 'dotenv';

dotenv.config();
puppeteer.use(StealthPlugin());

const TIMEOUT = parseInt(process.env.CRAWLER_TIMEOUT_MS) || 60000;

const createCrawler = (db) => {
    const { salvarLista } = db;
    const SITE = 'parquedosleiloes.com.br';
    const BASE_URL = 'https://www.parquedosleiloes.com.br';

    const buscarTodasPaginas = async (maxPaginas = 30) => { // Increased depth
        console.log(`🚀 [${SITE}] HIGH-YIELD: Iniciando coleta profunda...`);

        const browser = await puppeteer.launch({
            headless: "new",
            protocolTimeout: 120000,
            args: ['--no-sandbox', '--disable-setuid-sandbox']
        });

        let totalCapturado = 0;
        try {
            const page = await browser.newPage();
            await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36');

            for (let p = 1; p <= maxPaginas; p++) {
                console.log(`🔍 [${SITE}] Buscando página ${p}...`);
                const url = `${BASE_URL}/leiloes?is_lot=1&searchMode=normal&page=${p}`;

                let success = false;
                try {
                    await page.goto(url, { waitUntil: 'networkidle2', timeout: TIMEOUT });
                    await page.waitForSelector('.auction-lot-card', { timeout: 15000 }).catch(() => null);
                    success = true;
                } catch (e) {
                    console.log(`   ⚠️ [${SITE}] Erro ao carregar página ${p}, tentando novamente...`);
                    await page.reload({ waitUntil: 'networkidle2' });
                }

                if (!success) break;

                const itens = await page.evaluate((site) => {
                    const results = [];
                    const cards = document.querySelectorAll('.auction-lot-card');

                    cards.forEach(card => {
                        const linkEl = card.querySelector('.thumbnail a');
                        const h3El = card.querySelector('.name');
                        const imgEl = card.querySelector('img');

                        if (!linkEl || !h3El) return;

                        const title = h3El.innerText.trim();
                        const link = linkEl.href;
                        const registro = link.split('/').pop();
                        const details = card.querySelector('.comments-text')?.innerText.trim() || '';

                        results.push({
                            registro,
                            site: site,
                            veiculo: title.toUpperCase(),
                            link: link,
                            fotos: imgEl && imgEl.src ? [imgEl.src] : [],
                            descricao: details,
                            localLeilao: 'DF',
                            modalidade: 'leilao',
                            tipo: 'veiculo'
                        });
                    });
                    return results;
                }, SITE);

                if (itens.length === 0) {
                    console.log(`   🔸 [${SITE}] Fim da listagem na página ${p}.`);
                    break;
                }

                // Standard Fuzzy Filter
                const filtered = itens.filter(item => {
                    const text = (item.veiculo + ' ' + item.descricao).toUpperCase();
                    const blacklist = ['MOVEIS', 'ELETRO', 'INFORMÁTICA', 'SUCATA DE FERRO', 'LOTE DE PEÇAS', 'IMOVEL', 'EQUIPAMENTO'];
                    return !blacklist.some(b => text.includes(b));
                });

                if (filtered.length > 0) {
                    await salvarLista(filtered);
                    totalCapturado += filtered.length;
                    console.log(`   ✅ Salvos ${filtered.length} veículos. Total: ${totalCapturado}`);
                }

                // Check Next Page
                const hasNext = await page.evaluate(() => {
                    const next = document.querySelector('li.next:not(.disabled)');
                    return !!next;
                });
                if (!hasNext) break;
            }

        } catch (error) {
            console.error(`❌ [${SITE}] Erro:`, error.message);
        } finally {
            await browser.close();
        }
        console.log(`✅ [${SITE}] Finalizado: ${totalCapturado} veículos coletados.`);
        return totalCapturado;
    };

    return { buscarTodasPaginas, SITE, buscarTodos: buscarTodasPaginas };
};

export default createCrawler;
