import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import fs from 'fs';

puppeteer.use(StealthPlugin());

(async () => {
    console.log('🚀 Debugging Leilo (Puppeteer)...');
    const browser = await puppeteer.launch({
        headless: 'new',
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    try {
        const page = await browser.newPage();
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36');

        console.log('Navigating to https://www.leilo.com.br/leilao ...');
        await page.goto('https://www.leilo.com.br/leilao', { waitUntil: 'domcontentloaded', timeout: 60000 });

        console.log('Page loaded. Taking screenshot...');
        await page.screenshot({ path: 'leilo_debug.png', fullPage: true });

        const html = await page.content();
        console.log('HTML length:', html.length);
        fs.writeFileSync('leilo_debug.html', html);

    } catch (e) {
        console.error('Error:', e.message);
    } finally {
        await browser.close();
    }
})();
