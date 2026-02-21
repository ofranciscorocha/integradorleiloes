
import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import { getExecutablePath, getCommonArgs } from './src/utils/browser.js';

puppeteer.use(StealthPlugin());

async function checkLoadMore() {
    console.log('Starting browser...');
    const browser = await puppeteer.launch({
        executablePath: getExecutablePath(),
        headless: true,
        args: getCommonArgs()
    });

    const page = await browser.newPage();
    await page.setViewport({ width: 1366, height: 768 });
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36');

    try {
        console.log('Navigating to Category 1...');
        await page.goto('https://www.freitasleiloeiro.com.br/Leiloes/PesquisarLotes?Categoria=1', { waitUntil: 'networkidle2', timeout: 60000 });

        for (let i = 0; i < 20; i++) {
            await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
            await new Promise(r => setTimeout(r, 3000));

            const data = await page.evaluate(() => {
                const cards = document.querySelectorAll('.cardlote, .cardLote, .lote-item');
                const btn = Array.from(document.querySelectorAll('button, a, span, div'))
                    .find(el => {
                        const t = (el.innerText || '').toUpperCase();
                        return (t.includes('CARREGAR') || t.includes('MAIS')) && el.offsetParent !== null;
                    });
                return {
                    count: cards.length,
                    btn: btn ? { tag: btn.tagName, text: btn.innerText.substring(0, 30) } : null
                };
            });

            console.log(`Step ${i}: ${data.count} cards. Btn: ${JSON.stringify(data.btn)}`);

            if (data.btn) {
                await page.evaluate(() => {
                    const btn = Array.from(document.querySelectorAll('button, a, span, div'))
                        .find(el => {
                            const t = (el.innerText || '').toUpperCase();
                            return (t.includes('CARREGAR') || t.includes('MAIS')) && el.offsetParent !== null;
                        });
                    if (btn) btn.click();
                });
                console.log('Clicked!');
                await new Promise(r => setTimeout(r, 4000));
            } else if (i > 3) {
                console.log('No more buttons.');
                // Try scrolling one more time
                await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
                await new Promise(r => setTimeout(r, 3000));
                const finalCheck = await page.evaluate(() => document.querySelectorAll('.cardlote').length);
                if (finalCheck === data.count) break;
            }
        }

        const finalCount = await page.evaluate(() => document.querySelectorAll('.cardlote').length);
        console.log(`Final Count: ${finalCount}`);

    } catch (e) {
        console.error('Error during test:', e);
    } finally {
        await browser.close();
    }
}

checkLoadMore();
