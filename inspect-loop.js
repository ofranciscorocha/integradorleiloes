import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import fs from 'fs';

puppeteer.use(StealthPlugin());

(async () => {
    const browser = await puppeteer.launch({
        headless: "new",
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    try {
        const page = await browser.newPage();

        page.on('request', req => {
            if (req.resourceType() === 'xhr' || req.resourceType() === 'fetch') {
                console.log(`XHR/Fetch: ${req.url()}`);
            }
        });

        const url = 'https://www.loopleiloes.com.br/';
        console.log(`Navigating to ${url}...`);
        await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });

        await page.screenshot({ path: 'loop_inspect.png', fullPage: true });

        const html = await page.content();
        fs.writeFileSync('loop_dump.html', html);
        console.log('HTML dumped to loop_dump.html');

    } catch (e) {
        console.error(e);
    } finally {
        await browser.close();
    }
})();
