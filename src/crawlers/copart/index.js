import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import dotenv from 'dotenv';
import { getExecutablePath, getCommonArgs } from '../../utils/browser.js';

dotenv.config();
puppeteer.use(StealthPlugin());

const SITE = 'copart.com.br';
const BASE_URL = 'https://www.copart.com.br';

const createCrawler = (db) => {
    const { salvarLista } = db;

    const buscarTodos = async () => {
        console.log(`🚀 [${SITE}] Iniciando crawler Copart...`);
        const browser = await puppeteer.launch({
            executablePath: getExecutablePath(),
            headless: true,
            args: getCommonArgs()
        });

        try {
            const page = await browser.newPage();
            // Copart is heavy, block resources
            await page.setRequestInterception(true);
            page.on('request', (req) => {
                if (['image', 'media', 'font'].includes(req.resourceType())) req.abort();
                else req.continue();
            });

            // Iterate pages (Example URL, need to refine)
            // https://www.copart.com.br/lotSearchResults?free=true&query=&page=1

            let pageNum = 1;
            let hasMore = true;

            while (hasMore && pageNum <= 10) { // Limit for now
                console.log(`   📄 [${SITE}] Acessando página ${pageNum}...`);
                const url = `${BASE_URL}/lotSearchResults?free=true&query=&page=${pageNum}`;

                await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });

                // Wait for grid
                try {
                    await page.waitForSelector('table#serverSideDataTable tbody tr', { timeout: 15000 });
                } catch (e) {
                    console.log(`      🔸 [${SITE}] Timeout esperando tabela na pág ${pageNum}.`);
                    hasMore = false;
                    continue;
                }

                const items = await page.evaluate((site, base) => {
                    const rows = document.querySelectorAll('table#serverSideDataTable tbody tr');
                    const results = [];

                    rows.forEach(row => {
                        try {
                            const linkEl = row.querySelector('a[href*="/lot/"]');
                            if (!linkEl) return;

                            const relativeLink = linkEl.getAttribute('href');
                            const link = relativeLink.startsWith('http') ? relativeLink : `${base}${relativeLink}`;
                            const registro = link.split('/lot/')[1]?.split('/')[0] || Date.now().toString();

                            // Selectors need to be verified against real Copart HTML
                            // Assuming basic structure for now
                            const cells = row.querySelectorAll('td');
                            const veiculo = linkEl.textContent.trim();
                            const ano = cells[3]?.textContent.trim() || '';
                            const local = cells[9]?.textContent.trim() || '';

                            results.push({
                                site,
                                registro,
                                link,
                                veiculo,
                                ano,
                                localLeilao: local,
                                valor: 0, // Auctions usually don't show price in list easily
                                modalidade: 'leilao',
                                tipo: 'veiculo',
                                fotos: [] // Detail page needed for photos usually
                            });
                        } catch (e) { }
                    });
                    return results;
                }, SITE, BASE_URL);

                if (items.length > 0) {
                    await salvarLista(items);
                    console.log(`      ✅ [${SITE}] Página ${pageNum}: ${items.length} itens.`);
                } else {
                    console.log(`      🔸 [${SITE}] Página ${pageNum}: 0 itens.`);
                    hasMore = false;
                }

                pageNum++;
            }

        } catch (error) {
            console.error(`❌ [${SITE}] Erro:`, error.message);
        } finally {
            await browser.close();
        }
    };

    return { buscarTodos, SITE };
};

export default createCrawler;
