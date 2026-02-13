import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import fs from 'fs';

puppeteer.use(StealthPlugin());

(async () => {
    const browser = await puppeteer.launch({
        headless: 'new',
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    try {
        const page = await browser.newPage();
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36');

        console.log('Navigating Sodré...');
        await page.goto('https://www.sodresantoro.com.br/veiculos/lotes?sort=lot_visits_desc', { waitUntil: 'domcontentloaded', timeout: 60000 });

        console.log('Waiting 10s...');
        await new Promise(r => setTimeout(r, 10000));

        const html = await page.content();
        fs.writeFileSync('sodre_dump.html', html);
        console.log(`Saved Sodré HTML (${html.length} bytes)`);

    } catch (e) {
        console.error('Error:', e.message);
    } finally {
        await browser.close();
    }
})();
