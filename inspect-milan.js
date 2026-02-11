import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import fs from 'fs';

puppeteer.use(StealthPlugin());

(async () => {
    console.log('--- Inspecting Milan Leilões ---');
    const browser = await puppeteer.launch({ headless: "new" });
    const page = await browser.newPage();

    // Monitor API/Fetch
    page.on('response', async (response) => {
        const url = response.url();
        if (url.includes('api') || url.includes('json')) {
            console.log(`Intercepted: ${url}`);
        }
    });

    try {
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

        console.log('Navigating to Milan...');
        await page.goto('https://milanleiloes.com.br/Leiloes/Agenda.asp', { waitUntil: 'networkidle0', timeout: 90000 });

        // Wait extra for turnstile
        console.log('Waiting for content to load (Cloudflare)...');
        await new Promise(r => setTimeout(r, 15000));

        // Save HTML for structure analysis
        const html = await page.content();
        fs.writeFileSync('milan_dump.html', html);
        console.log('HTML dumped to milan_dump.html');

        await page.screenshot({ path: 'milan_inspect.png' });
        console.log('Screenshot saved to milan_inspect.png');

    } catch (e) {
        console.error('Error during inspection:', e.message);
    } finally {
        await browser.close();
    }
})();
