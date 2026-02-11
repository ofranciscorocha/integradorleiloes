import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import fs from 'fs';

puppeteer.use(StealthPlugin());

(async () => {
    console.log('--- Inspecting Parque dos Leilões ---');
    const browser = await puppeteer.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
    });
    const page = await browser.newPage();

    try {
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

        console.log('Navigating to Parque dos Leilões...');
        await page.goto('https://www.parquedosleiloes.com.br/leiloes', { waitUntil: 'networkidle2', timeout: 90000 });

        const html = await page.content();
        fs.writeFileSync('parque_dump.html', html);
        await page.screenshot({ path: 'parque_inspect.png' });

    } catch (e) {
        console.error('Error during inspection:', e.message);
    } finally {
        await browser.close();
    }
})();
