
import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import { getExecutablePath, getCommonArgs } from './src/utils/browser.js';
import createCrawler from './src/crawlers/freitas/index.js';

puppeteer.use(StealthPlugin());

async function testExtraction() {
    const browser = await puppeteer.launch({
        executablePath: getExecutablePath(),
        headless: true,
        args: getCommonArgs()
    });
    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36');

    try {
        console.log('Testing Freitas extraction on Category 1...');
        await page.goto('https://www.freitasleiloeiro.com.br/Leiloes/PesquisarLotes?Categoria=1', { waitUntil: 'networkidle2' });

        const crawler = createCrawler({
            salvarLista: async (items) => {
                console.log(`Crawler would save ${items.length} items.`);
                items.forEach((item, i) => {
                    if (i < 3) console.log(`[${i}] Title: ${item.veiculo}, Image: ${item.fotos[0]}`);
                });
            }
        });

        // This is a hack to call the internal function for testing
        // I'll just use the logic from the index.js directly or use page.evaluate
    } catch (e) {
        console.error(e);
    } finally {
        await browser.close();
    }
}
testExtraction();
