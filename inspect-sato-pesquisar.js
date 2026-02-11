import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import fs from 'fs';

puppeteer.use(StealthPlugin());

(async () => {
    console.log('--- Inspecting Sato Leilões (Pesquisar) ---');
    const browser = await puppeteer.launch({
        headless: true,
        args: ['--no-sandbox']
    });
    const page = await browser.newPage();

    try {
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36');

        console.log('Navigating to Pesquisar...');
        await page.goto('https://satoleiloes.com.br/pesquisar', { waitUntil: 'networkidle2', timeout: 90000 });

        // Wait for Cloudflare if necessary
        console.log('Waiting for content to load (Cloudflare check)...');
        await new Promise(r => setTimeout(r, 15000));

        const html = await page.content();
        fs.writeFileSync('sato_pesquisar_dump.html', html);
        await page.screenshot({ path: 'sato_pesquisar_inspect.png', fullPage: true });

        console.log('Inspection complete.');

    } catch (e) {
        console.error('Error:', e.message);
    } finally {
        await browser.close();
    }
})();
