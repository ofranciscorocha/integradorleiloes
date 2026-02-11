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

        page.on('response', async response => {
            const url = response.url();
            if (url.includes('api') && url.includes('json')) {
                console.log(`Intercepted API: ${url}`);
                try {
                    const data = await response.json();
                    fs.writeFileSync(`leilo_api_retry_${Date.now()}.json`, JSON.stringify(data, null, 2));
                } catch (e) { }
            }
        });

        // Use domcontentloaded for speed
        const url = 'https://www.leilo.com.br/lotes/veiculos';
        console.log(`Navigating to ${url}...`);
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });

        // Wait a bit for requests
        await new Promise(r => setTimeout(r, 5000));

        // Dump HTML just in case
        const html = await page.content();
        fs.writeFileSync('leilo_dump_retry.html', html);

    } catch (e) {
        console.error(e);
    } finally {
        await browser.close();
    }
})();
