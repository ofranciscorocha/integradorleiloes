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

        // Log requests to see if there's an API
        page.on('request', req => {
            if (req.resourceType() === 'xhr' || req.resourceType() === 'fetch') {
                console.log(`XHR/Fetch: ${req.url()}`);
            }
        });

        const url = 'https://www.copart.com.br/';
        console.log(`Navigating to ${url}...`);
        await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });

        // Screenshot to see what we are dealing with
        await page.screenshot({ path: 'copart_inspect.png', fullPage: true });

        // Dump HTML
        const html = await page.content();
        fs.writeFileSync('copart_dump.html', html);
        console.log('HTML dumped to copart_dump.html');

    } catch (e) {
        console.error(e);
    } finally {
        await browser.close();
    }
})();
