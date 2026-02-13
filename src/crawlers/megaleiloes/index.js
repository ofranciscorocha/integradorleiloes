import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import dotenv from 'dotenv';

dotenv.config();
puppeteer.use(StealthPlugin());

const TIMEOUT = parseInt(process.env.CRAWLER_TIMEOUT_MS) || 90000;

const createCrawler = (db) => {
    const { salvarLista } = db;
    const SITE = 'megaleiloes.com.br';
    const BASE_URL = 'https://www.megaleiloes.com.br';

    const buscarTodos = async () => {
        console.log(`🚀 [${SITE}] SUPERCRAWLER: Iniciando captura massiva...`);

        const browser = await puppeteer.launch({
            headless: "new",
            args: ['--no-sandbox', '--disable-setuid-sandbox', '--window-size=1920,1080']
        });

        let capturados = 0;
        try {
            const page = await browser.newPage();
            await page.setViewport({ width: 1920, height: 1080 });
            await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36');

            // Mega Leilões has paginated vehicle listings
            const categories = [
                { url: `${BASE_URL}/veiculos?pagina=`, name: 'Veículos', maxPages: 50 },
                { url: `${BASE_URL}/veiculos/carros?pagina=`, name: 'Carros', maxPages: 50 },
                { url: `${BASE_URL}/veiculos/motos?pagina=`, name: 'Motos', maxPages: 20 },
                { url: `${BASE_URL}/veiculos/caminhoes?pagina=`, name: 'Caminhões', maxPages: 20 },
            ];

            const allLinks = new Set();

            for (const cat of categories) {
                console.log(`   📋 [${SITE}] Categoria: ${cat.name}`);

                for (let p = 1; p <= cat.maxPages; p++) {
                    try {
                        await page.goto(`${cat.url}${p}`, { waitUntil: 'domcontentloaded', timeout: TIMEOUT });
                        await new Promise(r => setTimeout(r, 1500));

                        const items = await page.evaluate((site, baseUrl) => {
                            const results = [];
                            // Mega Leilões uses product cards with links like /veiculos/carros/sp/...
                            const cards = document.querySelectorAll('.product-card, .card, [class*="card"], [class*="lot"], article, .item');

                            cards.forEach(card => {
                                try {
                                    const linkEl = card.querySelector('a[href*="/veiculos/"], a[href*="/leilao/"]');
                                    if (!linkEl) return;

                                    const link = linkEl.href;
                                    const text = card.innerText || '';
                                    if (text.length < 10) return;

                                    const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 3);
                                    const title = lines[0] || '';

                                    const imgEl = card.querySelector('img');
                                    const priceMatch = text.match(/R\$\s?[\d.,]+/);
                                    const yearMatch = text.match(/(20[0-2]\d|19[89]\d)/);

                                    // Extract location
                                    const locationMatch = text.match(/([A-Za-záéíóúãõç\s]+),\s*([A-Z]{2})/);
                                    const location = locationMatch ? `${locationMatch[1].trim()}, ${locationMatch[2]}` : 'Brasil';

                                    // Get leilão type (Judicial, Extrajudicial)
                                    const tipoMatch = text.match(/(Judicial|Extrajudicial|Venda Direta)/i);
                                    const modalidade = tipoMatch ? tipoMatch[1] : 'leilao';

                                    results.push({
                                        registro: link.split('/').pop().split('?')[0] || '',
                                        site: site,
                                        link: link,
                                        veiculo: title.toUpperCase().substring(0, 120),
                                        fotos: imgEl && imgEl.src && !imgEl.src.includes('placeholder') && !imgEl.src.includes('data:image') ? [imgEl.src] : [],
                                        valor: priceMatch ? parseFloat(priceMatch[0].replace('R$', '').replace(/\./g, '').replace(',', '.').trim()) || 0 : 0,
                                        ano: yearMatch ? parseInt(yearMatch[1]) : null,
                                        localLeilao: location,
                                        modalidade: modalidade.toLowerCase(),
                                        tipo: 'veiculo'
                                    });
                                } catch (e) { }
                            });
                            return results;
                        }, SITE, BASE_URL);

                        if (items.length === 0) {
                            console.log(`   🔸 [${SITE}] ${cat.name} - Fim na página ${p}`);
                            break;
                        }

                        // Deduplicate
                        const newItems = items.filter(i => !allLinks.has(i.link));
                        newItems.forEach(i => allLinks.add(i.link));

                        if (newItems.length > 0) {
                            await salvarLista(newItems);
                            capturados += newItems.length;
                            console.log(`   ✅ [${SITE}] ${cat.name} Pág ${p}: +${newItems.length} veículos. Total: ${capturados}`);
                        }

                        await new Promise(r => setTimeout(r, 800));
                    } catch (e) {
                        console.log(`   ⚠️ [${SITE}] Erro página ${p}: ${e.message}`);
                    }
                }
            }

        } catch (error) {
            console.error(`❌ [${SITE}] Erro Fatal:`, error.message);
        } finally {
            await browser.close();
        }

        console.log(`✅ [${SITE}] Finalizado! ${capturados} veículos coletados.`);
        return capturados;
    };

    return { buscarTodos, SITE };
};

export default createCrawler;
