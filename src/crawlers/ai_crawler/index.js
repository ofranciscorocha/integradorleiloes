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
            // 1. Identificar containers repetitivos (Cards)
            const items = await page.evaluate((site) => {
                const results = [];

                // Heuristica: Elementos que contém Preço e Ano
                // Buscamos todos os elementos 'a' ou 'div' que tenham estrutura de cartão
                const candidates = document.querySelectorAll('div, a, li');

                // Filtrar os que parecem ser cards de veículos
                // Devem ter texto contendo R$ e (ano 20..) e nome de carro

                // Simplificação: Pegar imagens + links que estejam próximos
                // Melhor: Usar seletor genérico de card framework
                const cards = document.querySelectorAll('.card, .item, .lot-item, .product-item, div[class*="card"], div[class*="lote"]');

                cards.forEach(card => {
                    const text = card.innerText || '';
                    if (text.length < 20) return;

                    // Check for Price pattern
                    const priceMatch = text.match(/R\$\s?[\d\.,]+/);
                    // Check for Year pattern
                    const yearMatch = text.match(/20[0-2][0-9]/);

                    if (priceMatch || yearMatch) {
                        const linkEl = card.querySelector('a') || card.closest('a');
                        const imgEl = card.querySelector('img');

                        if (linkEl) {
                            results.push({
                                registro: linkEl.href.split('/').pop() + Math.random().toString(36).substr(2, 3), // Fallback ID
                                site: site,
                                link: linkEl.href,
                                veiculo: (text.split('\n')[0] || 'Veículo Detectado').substring(0, 100),
                                fotos: imgEl ? [imgEl.src] : [],
                                descricao: text.substring(0, 200) + '...',
                                valor: priceMatch ? parseFloat(priceMatch[0].replace('R$', '').replace(/\./g, '').replace(',', '.')) : 0,
                                ano: yearMatch ? parseInt(yearMatch[0]) : null,
                                modalidade: 'leilao' // Default
                            });
                        }
                    }
                });

                // Deduplicate by link
                const unique = [];
                const links = new Set();
                for (const i of results) {
                    if (!links.has(i.link)) {
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
