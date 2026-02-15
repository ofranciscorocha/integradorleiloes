import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import dotenv from 'dotenv';

dotenv.config();
puppeteer.use(StealthPlugin());

const TIMEOUT = parseInt(process.env.CRAWLER_TIMEOUT_MS) || 90000;

const createCrawler = (db) => {
    const { salvarLista } = db;
    const SITE = 'vipleiloes.com.br';
    const BASE_URL = 'https://www.vipleiloes.com.br';

    const extractFromPage = async (page) => {
        return await page.evaluate((site, base) => {
            const items = [];
            // VIP uses .itm-card for vehicle cards
            const cards = document.querySelectorAll('div.itm-card');

            cards.forEach(card => {
                try {
                    const linkEl = card.querySelector('a.itm-cdlink');
                    if (!linkEl) return;

                    const linkUrl = linkEl.getAttribute('href') || '';
                    const registro = linkUrl.split('/').pop();

                    const body = card.querySelector('div.itm-body');
                    const firstline = body ? body.querySelectorAll('div.itm-firstline p.itm-info') : [];

                    let lote = '', local = '';
                    firstline.forEach(p => {
                        const text = p.textContent;
                        if (text.includes('Lote:')) lote = text.split(':')[1]?.trim() || '';
                        if (text.includes('Local:')) local = text.split(':')[1]?.trim() || '';
                    });

                    const nameEl = body ? body.querySelector('h4.itm-name') : null;
                    const veiculo = nameEl ? nameEl.textContent.replace(/\n/g, ' ').trim().toUpperCase() : '';

                    const priceEl = card.querySelector('.itm-price-val');
                    const precoText = priceEl ? priceEl.textContent.replace(/[^0-9,]/g, '').replace(',', '.') : '0';

                    // Image - try multiple approaches
                    let imgUrl = '';
                    const imgEl = card.querySelector('.itm-img, img');
                    if (imgEl) {
                        imgUrl = imgEl.getAttribute('src') || imgEl.getAttribute('data-src') || imgEl.getAttribute('data-lazy') || '';
                    }
                    // Also check background-image
                    if (!imgUrl) {
                        const bgEl = card.querySelector('[style*="background-image"]');
                        if (bgEl) {
                            const match = bgEl.getAttribute('style')?.match(/url\(['"]?([^'")]+)['"]?\)/);
                            if (match) imgUrl = match[1];
                        }
                    }

                    if (imgUrl && !imgUrl.startsWith('http')) {
                        imgUrl = `${base}${imgUrl}`;
                    }

                    const fotos = imgUrl && !imgUrl.includes('placeholder') && !imgUrl.includes('no-image')
                        ? [imgUrl] : [];

                    items.push({
                        site,
                        registro,
                        link: linkUrl.startsWith('http') ? linkUrl : `${base}${linkUrl}`,
                        veiculo: veiculo || 'VEÍCULO VIP',
                        fotos,
                        valor: parseFloat(precoText) || 0,
                        localLeilao: local || 'Brasil',
                        lote,
                        modalidade: 'leilao',
                        tipo: 'veiculo'
                    });
                } catch (e) { }
            });

            return items;
        }, SITE, BASE_URL);
    };

    const buscarTodos = async () => {
        console.log(`🚀 [${SITE}] SUPERCRAWLER: Iniciando captura 100% Puppeteer...`);

        const browser = await puppeteer.launch({
            headless: "new",
            protocolTimeout: 240000,
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-gpu',
                '--window-size=1920,1080'
            ]
        });

        let totalCapturados = 0;
        const seenIds = new Set();

        try {
            const page = await browser.newPage();
            await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36');
            await page.setViewport({ width: 1920, height: 1080 });

            // Establish session
            console.log(`   🔍 [${SITE}] Estabelecendo sessão...`);
            await page.goto(BASE_URL, { waitUntil: 'domcontentloaded', timeout: TIMEOUT });
            await new Promise(r => setTimeout(r, 3000));

            // Categories: 3=Automóveis, 4=Caminhões, 5=Motos, 37=Utilitários
            const categorias = [3, 4, 5, 37];

            for (const cat of categorias) {
                let pagina = 1;
                let hasMore = true;

                console.log(`\n📂 [${SITE}] Categoria ${cat}...`);

                while (hasMore && pagina <= 50) {
                    const url = `${BASE_URL}/pesquisa?Pagina=${pagina}&Categorias=${cat}&OrdenacaoVeiculo=InicioLeilao`;
                    console.log(`   📄 [${SITE}] Cat ${cat}, pág ${pagina}...`);

                    try {
                        // Use domcontentloaded for speed, networkidle2 is too slow on Vip
                        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: TIMEOUT });
                        await new Promise(r => setTimeout(r, 4000)); // Manual wait for React hydration

                        await page.waitForSelector('div.itm-card', { timeout: 10000 }).catch(() => null);

                        const items = await extractFromPage(page);

                        if (items.length === 0) {
                            console.log(`   🔸 [${SITE}] Cat ${cat} sem resultados na pág ${pagina}. Fim.`);
                            hasMore = false;
                            continue;
                        }

                        // Deduplicate
                        const newItems = items.filter(item => {
                            if (seenIds.has(item.registro)) return false;
                            seenIds.add(item.registro);
                            return true;
                        });

                        if (newItems.length > 0) {
                            await salvarLista(newItems);
                            totalCapturados += newItems.length;
                            console.log(`   ✅ [${SITE}] +${newItems.length} veículos. Total: ${totalCapturados}`);
                        }

                        // Check "Próxima" button or total pages logic
                        const totalText = await page.evaluate(() => {
                            const h4 = document.querySelector('div.col-md-12.tituloListagem h4');
                            return h4 ? h4.textContent.replace(/[^\d]/g, '') : '0';
                        });
                        const total = parseInt(totalText) || 0;
                        const totalPaginas = Math.ceil(total / 12);

                        if (pagina >= totalPaginas) {
                            hasMore = false;
                        } else {
                            pagina++;
                            await new Promise(r => setTimeout(r, 500));
                        }

                    } catch (e) {
                        console.log(`   ⚠️ [${SITE}] Erro cat ${cat} pág ${pagina}: ${e.message}`);
                        hasMore = false;
                    }
                }
            }

            console.log(`✅ [${SITE}] Finalizado! ${totalCapturados} veículos coletados.`);
            return totalCapturados;

        } catch (e) {
            console.error(`❌ [${SITE}] Erro:`, e.message);
            return 0;
        } finally {
            await browser.close();
        }
    };

    return { buscarTodos, SITE };
};

export default createCrawler;
