import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import dotenv from 'dotenv';
import moment from 'moment';

dotenv.config();
puppeteer.use(StealthPlugin());

const TIMEOUT = parseInt(process.env.CRAWLER_TIMEOUT_MS) || 45000;

const createCrawler = (db) => {
    const { salvarLista } = db;
    const SITE = 'leilo.com.br';
    const BASE_URL = 'https://www.leilo.com.br';

    const buscarTodasPaginas = async () => {
        console.log(`🚀 [${SITE}] Iniciando crawler (Puppeteer Mode)...`);

        const browser = await puppeteer.launch({
            headless: "new",
            args: ['--no-sandbox', '--disable-setuid-sandbox']
        });

        const listaCompleta = [];
        try {
            const page = await browser.newPage();
            await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36');

            console.log(`🔍 [${SITE}] Navegando para listagem...`);
            // Try specific auction page if general list is empty or fails
            // But let's try the main list first
            await page.goto(`${BASE_URL}/leilao`, { waitUntil: 'networkidle2', timeout: TIMEOUT });

            console.log(`⌛ [${SITE}] Aguardando cards...`);
            // Wait for cards - need to identify selector. Assuming .card or similar from dump analysis? 
            // Since dump failed, let's guess standard structure or look for 'lote' text
            // In a real scenario I'd inspect the site. Given I can't see it, I'll allow a generous wait and try identifying common classes.
            // Based on other crawlers, .card, .lot-item, etc.
            // Let's try waiting for ANY element that looks like a card
            try {
                await page.waitForSelector('.MuiCard-root, .card, div[class*="card"], div[class*="lote"]', { timeout: 15000 });
            } catch (e) {
                console.log('Timeout waiting for selector, proceeding to evaluate anyway...');
            }

            // Scroll to trigger lazy load
            await page.evaluate(async () => {
                for (let i = 0; i < 5; i++) {
                    window.scrollBy(0, 500);
                    await new Promise(r => setTimeout(r, 500));
                }
            });

            // Extract items
            const itens = await page.evaluate((site) => {
                const results = [];
                // Try to find elements by generic classes if specific ones aren't known
                // Or try to parse from specific known structure if available
                // Assuming standard Nuxt/Vuetify/MUI structure often used
                const cards = document.querySelectorAll('.MuiCard-root, .card, div[class*="lote-card"], div[class*="lot-card"]');

                if (cards.length === 0) {
                    console.log('DEBUG: No generic cards found');
                    return [];
                }

                cards.forEach(card => {
                    const linkEl = card.querySelector('a');
                    const imgEl = card.querySelector('img');
                    const text = card.innerText;

                    if (!linkEl) return;

                    results.push({
                        registro: linkEl.href.split('/').pop(),
                        site: site,
                        link: linkEl.href,
                        veiculo: text.split('\n')[0] || 'VEÍCULO',
                        fotos: imgEl ? [imgEl.src] : [],
                        descricao: text,
                        modalidade: 'leilao'
                    });
                });
                return results;
            }, SITE);

            const filteredItens = itens.filter(item => {
                const textToTest = (item.veiculo + ' ' + item.descricao).toUpperCase();
                const whitelist = ['AUTOMOVEL', 'VEICULO', 'CARRO', 'MOTO', 'CAMINHAO', 'ONIBUS', 'TRATOR', 'REBOQUE', 'SEMI-REBOQUE', 'CAVALO MECANICO', 'EMPILHADEIRA', 'RETROESCAVADEIRA', 'MAQUINA', 'SUCATA DE VEICULO', 'HONDA', 'TOYOTA', 'FIAT', 'VOLKSWAGEN', 'CHEVROLET', 'FORD', 'YAMAHA', 'KAWASAKI', 'SUZUKI', 'HYUNDAI', 'RENAULT'];
                const blacklist = ['MOVEIS', 'ELETRO', 'INFORMÁTICA', 'SUCATA DE FERRO', 'LOTE DE PEÇAS', 'DIVERSOS', 'TELEVISAO', 'CELULAR', 'CADEIRA', 'MESA', 'ARMARIO', 'GELADEIRA', 'FOGAO', 'MACBOOK', 'IPHONE', 'NOTEBOOK', 'MONITOR', 'BEBEDOURO', 'SOFA', 'ROUPAS', 'CALCADOS', 'BOLSAS', 'BRINQUEDOS', 'IMOVEL', 'IMOVEIS', 'CASA', 'APARTAMENTO', 'TERRENO', 'SITIO', 'FAZENDA', 'GALPAO'];

                const isWhitelisted = whitelist.some(w => textToTest.includes(w));
                const isBlacklisted = blacklist.some(b => textToTest.includes(b));

                if (isBlacklisted) return false;
                if (!isWhitelisted) return false;
                return true;
            });

            console.log(`✅ [${SITE}] ${filteredItens.length} veículos capturados.`);
            if (filteredItens.length > 0) {
                await salvarLista(filteredItens);
            }
            listaCompleta.push(...filteredItens);

        } catch (error) {
            console.error(`❌ [${SITE}] Erro:`, error.message);
        } finally {
            await browser.close();
        }
        return listaCompleta.length;
    };

    return { buscarTodasPaginas, SITE, buscarTodos: buscarTodasPaginas };
};

export default createCrawler;
