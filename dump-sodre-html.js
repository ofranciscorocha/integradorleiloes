import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import fs from 'fs';

puppeteer.use(StealthPlugin());

(async () => {
    const browser = await puppeteer.launch({
        headless: "new",
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--window-size=1920,1080']
    });

    try {
        const page = await browser.newPage();
        const url = 'https://www.sodresantoro.com.br/veiculos/lotes?sort=lot_visits_desc';
        console.log(`Navigating to ${url}...`);
        await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });

        // Scroll a bit to ensure hydration
        await page.evaluate(async () => {
            window.scrollBy(0, 500);
            await new Promise(r => setTimeout(r, 1000));
        });

        const html = await page.content();
        fs.writeFileSync('sodre-dump.html', html);
        console.log('HTML dumped to sodre-dump.html');

    } catch (e) {
        console.error(e);
    } finally {
        await browser.close();
    }
})();
