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

        const target = 'https://www.vipleiloes.com.br/pesquisa?classificacao=Sinistrados';
        console.log(`Navigating to ${target}...`);
        await page.goto(target, { waitUntil: 'domcontentloaded', timeout: 60000 });
        await new Promise(r => setTimeout(r, 5000));

        await page.screenshot({ path: 'vip_sinistrados.png' });
        const html = await page.evaluate(() => document.body.innerHTML.substring(0, 50000));
        fs.writeFileSync('vip_sinistrados.html', html);

        const cardCount = await page.evaluate(() => {
            return document.querySelectorAll('a[href*="/evento/anuncio/"], .card, [class*="card"]').length;
        });
        console.log(`Found ${cardCount} cards/links`);

    } catch (e) {
        console.error('Error:', e.message);
    } finally {
        await browser.close();
    }
})();
