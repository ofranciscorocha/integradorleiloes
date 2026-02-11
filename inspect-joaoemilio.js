import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import fs from 'fs';

puppeteer.use(StealthPlugin());

(async () => {
    console.log('--- Inspecting João Emílio Leilões ---');
    const browser = await puppeteer.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
    });
    const page = await browser.newPage();

    try {
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

        console.log('Navigating to João Emílio...');
        await page.goto('https://www.joaoemilio.com.br/agenda', { waitUntil: 'networkidle2', timeout: 90000 });

        const html = await page.content();
        fs.writeFileSync('joaoemilio_dump.html', html);
        console.log('HTML dumped to joaoemilio_dump.html');

        await page.screenshot({ path: 'joaoemilio_inspect.png' });
        console.log('Screenshot saved to joaoemilio_inspect.png');

    } catch (e) {
        console.error('Error during inspection:', e.message);
    } finally {
        await browser.close();
    }
})();
