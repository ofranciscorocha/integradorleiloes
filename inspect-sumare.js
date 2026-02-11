import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import fs from 'fs';

puppeteer.use(StealthPlugin());

(async () => {
    console.log('--- Inspecting Sumaré Leilões ---');
    const browser = await puppeteer.launch({
        headless: "new",
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    const page = await browser.newPage();

    page.on('response', async (response) => {
        if (response.url().includes('api') || response.url().includes('json')) {
            console.log(`Intercepted: ${response.url()}`);
        }
    });

    try {
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
        await page.goto('https://www.sumareleiloes.com.br/', { waitUntil: 'networkidle2', timeout: 60000 });

        const html = await page.content();
        fs.writeFileSync('sumare_dump.html', html);
        console.log('HTML dumped to sumare_dump.html');

        await page.screenshot({ path: 'sumare_inspect.png' });
        console.log('Screenshot saved to sumare_inspect.png');

    } catch (e) {
        console.error('Error during inspection:', e.message);
    } finally {
        await browser.close();
    }
})();
