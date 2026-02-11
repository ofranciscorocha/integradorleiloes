import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import fs from 'fs';

puppeteer.use(StealthPlugin());

(async () => {
    console.log('--- Inspecting MGL Leilões ---');
    const browser = await puppeteer.launch({ 
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
    });
    const page = await browser.newPage();

    try {
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
        
        console.log('Navigating to MGL...');
        await page.goto('https://www.mgl.com.br/leiloes', { waitUntil: 'networkidle2', timeout: 90000 });
        
        const html = await page.content();
        fs.writeFileSync('mgl_dump.html', html);
        console.log('HTML dumped to mgl_dump.html');

        await page.screenshot({ path: 'mgl_inspect.png' });
        console.log('Screenshot saved to mgl_inspect.png');

    } catch (e) {
        console.error('Error during inspection:', e.message);
    } finally {
        await browser.close();
    }
})();
