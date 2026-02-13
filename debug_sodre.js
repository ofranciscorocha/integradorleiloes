import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import fs from 'fs';

puppeteer.use(StealthPlugin());

(async () => {
    console.log('🚀 Starting Sodré Debug...');
    const browser = await puppeteer.launch({
        headless: "new",
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    try {
        const page = await browser.newPage();
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36');

        const requests = [];

        await page.setRequestInterception(true);
        page.on('request', (req) => {
            requests.push({
                url: req.url(),
                method: req.method(),
                type: req.resourceType()
            });
            req.continue();
        });

        console.log('Navigating to https://www.sodresantoro.com.br/veiculos/lotes?sort=lot_visits_desc...');
        await page.goto('https://www.sodresantoro.com.br/veiculos/lotes?sort=lot_visits_desc', { waitUntil: 'networkidle2', timeout: 60000 });

        console.log('Waiting...');
        await new Promise(r => setTimeout(r, 5000));

        // Scroll a bit
        await page.evaluate(async () => {
            window.scrollBy(0, 500);
            await new Promise(r => setTimeout(r, 1000));
            window.scrollBy(0, 500);
        });

        await new Promise(r => setTimeout(r, 2000));

        console.log(` captured ${requests.length} requests`);

        // Filter for API-like requests
        const apiRequests = requests.filter(r => r.url.includes('api') || r.url.includes('json') || r.type === 'xhr' || r.type === 'fetch');

        fs.writeFileSync('sodre_requests.json', JSON.stringify(apiRequests, null, 2));
        console.log('Saved sodre_requests.json');
        process.exit(0);

    } catch (error) {
        console.error('❌ Error:', error);
        process.exit(1);
    } finally {
        // await browser.close();
    }
})();
