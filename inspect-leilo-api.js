import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import fs from 'fs';

puppeteer.use(StealthPlugin());

(async () => {
    const browser = await puppeteer.launch({
        headless: "new",
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--window-size=1920,1080']
    });

    try {
        const page = await browser.newPage();

        page.on('response', async response => {
            const url = response.url();
            if (url.includes('busca-elastic') || url.includes('obter-busca-possiveis')) {
                console.log(`Intercepted API: ${url}`);
                try {
                    const data = await response.json();
                    fs.writeFileSync(`leilo_api_${Date.now()}.json`, JSON.stringify(data, null, 2));
                    console.log(`Saved API response.`);
                } catch (e) { }
            }
        });

        // URL da busca de veículos
        const url = 'https://www.leilo.com.br/lotes/veiculos';
        console.log(`Navigating to ${url}...`);
        await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });

        // Scroll to trigger lazy loading if needed
        await page.evaluate(async () => {
            window.scrollBy(0, 1000);
            await new Promise(r => setTimeout(r, 2000));
        });

    } catch (e) {
        console.error(e);
    } finally {
        await browser.close();
    }
})();
