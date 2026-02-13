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
        await page.setViewport({ width: 1920, height: 1080 });

        console.log('Navigating to VIP Veiculos...');
        await page.goto('https://www.vipleiloes.com.br/Veiculos', { waitUntil: 'networkidle2', timeout: 60000 });

        await new Promise(r => setTimeout(r, 5000));

        console.log('Taking screenshot...');
        await page.screenshot({ path: 'vip_inspect.png', fullPage: false });

        console.log('Dumping HTML snippet...');
        const html = await page.evaluate(() => document.body.innerHTML.substring(0, 10000));
        fs.writeFileSync('vip_snippet.html', html);

        const cardCount = await page.evaluate(() => {
            return document.querySelectorAll('.card, [class*="card"], [class*="lote"], [class*="item"], a[href*="/lote/"]').length;
        });
        console.log(`Cards found with general selectors: ${cardCount}`);

    } catch (e) {
        console.error('Error:', e.message);
    } finally {
        await browser.close();
    }
})();
