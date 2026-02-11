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

        page.on('response', async response => {
            const url = response.url();
            if (url.includes('json') || response.headers()['content-type']?.includes('json')) {
                try {
                    const data = await response.json();
                    const filename = `sodre-payload-${Date.now()}.json`;
                    fs.writeFileSync(filename, JSON.stringify(data, null, 2));
                    console.log(`Saved JSON from ${url} to ${filename}`);
                } catch (e) { }
            }
        });

        const url = 'https://www.sodresantoro.com.br/veiculos/lotes?sort=lot_visits_desc';
        console.log(`Navigating to ${url}...`);
        await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });

        await page.evaluate(async () => {
            window.scrollBy(0, 500);
            await new Promise(r => setTimeout(r, 2000));
        });

    } catch (e) {
        console.error(e);
    } finally {
        await browser.close();
    }
})();
