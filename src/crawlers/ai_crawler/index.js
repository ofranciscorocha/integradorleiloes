import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import connectDatabase from '../../database/db.js';

puppeteer.use(StealthPlugin());

const createCrawler = (db) => {
    const { salvarLista } = db;

    const crawlGeneric = async (targetUrl, siteName) => {
        console.log(`🚀 [AI-Crawler] Iniciando análise de: ${targetUrl} (${siteName})`);

        if (!targetUrl || !targetUrl.startsWith('http')) {
            console.error('❌ URL inválida:', targetUrl);
            return 0;
        }

        const browser = await puppeteer.launch({
            executablePath: process.env.CHROME_PATH || (process.platform === 'linux' ? '/usr/bin/google-chrome-stable' : undefined),
            headless: true,
            protocolTimeout: 240000,
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-gpu',
                '--window-size=1280,720'
            ]
        });

        try {
            const page = await browser.newPage();
            await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36');

            console.log(`🔍 Navegando...`);
            await page.goto(targetUrl, { waitUntil: 'networkidle2', timeout: 60000 });

            // Scroll para carregar lazy loads
            await page.evaluate(async () => {
                for (let i = 0; i < 3; i++) {
                    window.scrollBy(0, 800);
                    await new Promise(r => setTimeout(r, 1000));
                }
            });

            // AI / Heuristic Analysis
            const items = await page.evaluate((site) => {
                const results = [];
                const cards = document.querySelectorAll('.card, .item, .lot-item, .product-item, div[class*="card"], div[class*="lote"], article, section > div');

                const brazilianStates = ['AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG', 'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO'];

                cards.forEach(card => {
                    const text = card.innerText || '';
                    if (text.length < 20) return;

                    // Regex Patterns
                    const priceMatch = text.match(/R\$\s?[\d\.]+,\d{2}/) || text.match(/R\$\s?[\d\.]+/);
                    const yearMatch = text.match(/\b(19|20)\d{2}\b/);

                    // Location Detection (UF)
                    let uf = null;
                    brazilianStates.forEach(state => {
                        if (text.includes(` - ${state}`) || text.includes(`/${state}`) || text.includes(` ${state} `)) {
                            uf = state;
                        }
                    });

                    // Filtering: Ensure it's likely a vehicle
                    const vehicleKeywords = ['km', 'marchas', 'flex', 'diesel', 'gasolina', 'portas', 'conversível', 'manual', 'automático'];
                    const isVehicle = vehicleKeywords.some(key => text.toLowerCase().includes(key)) || yearMatch;

                    if ((priceMatch || yearMatch) && isVehicle) {
                        const linkEl = card.querySelector('a') || card.closest('a');
                        const imgEl = card.querySelector('img');

                        if (linkEl && linkEl.href && !linkEl.href.includes('javascript:')) {
                            const title = (text.split('\n').find(l => l.trim().length > 10) || 'Veículo Detectado').trim();

                            results.push({
                                registro: linkEl.href.split('/').pop().replace(/[^a-z0-9]/gi, '_') + '_' + Math.random().toString(36).substr(2, 5),
                                site: site,
                                link: linkEl.href,
                                veiculo: title.substring(0, 100).replace(/\n/g, ' '),
                                fotos: imgEl && imgEl.src.startsWith('http') ? [imgEl.src] : [],
                                localLeilao: uf ? `Local: ${uf}` : 'Consultar',
                                valor: priceMatch ? parseFloat(priceMatch[0].replace('R$', '').replace(/\./g, '').replace(',', '.')) : 0,
                                ano: yearMatch ? parseInt(yearMatch[0]) : null,
                                condicao: text.toLowerCase().includes('sucata') ? 'Sucata' : 'Documentável',
                                modalidade: 'leilao'
                            });
                        }
                    }
                });

                // Deduplicate by link
                const unique = [];
                const links = new Set();
                for (const i of results) {
                    if (i.link && !links.has(i.link)) {
                        links.add(i.link);
                        unique.push(i);
                    }
                }
                return unique;
            }, siteName);

            console.log(`🤖 [AI-Crawler] Encontrados ${items.length} prováveis veículos com heurística.`);

            if (items.length > 0) {
                await salvarLista(items);
            }

            return items.length;

        } catch (e) {
            console.error('❌ Erro no AI Crawler:', e.message);
            return 0;
        } finally {
            await browser.close();
        }
    };

    return { crawlGeneric };
};

export default createCrawler;
