import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import fs from 'fs';

puppeteer.use(StealthPlugin());

(async () => {
    console.log('--- Inspecting Pestana Leilões ---');
    const browser = await puppeteer.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
    });
    const page = await browser.newPage();

    try {
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

        // Pestana usually has car category
        console.log('Navigating to Pestana...');
        await page.goto('https://www.pestanaleiloes.com.br/agenda-de-leiloes', { waitUntil: 'networkidle2', timeout: 90000 });

        const html = await page.content();
        fs.writeFileSync('pestana_dump.html', html);
        console.log('HTML dumped to pestana_dump.html');

        await page.screenshot({ path: 'pestana_inspect.png' });
        console.log('Screenshot saved to pestana_inspect.png');

    } catch (e) {
        console.error('Error during inspection:', e.message);
    } finally {
        await browser.close();
    }
})();
