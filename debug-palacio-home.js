import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import fs from 'fs';

puppeteer.use(StealthPlugin());

(async () => {
    const browser = await puppeteer.launch({ headless: "new", args: ['--no-sandbox'] });
    const page = await browser.newPage();
    try {
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36');
        console.log('Navigating to Palacio Home...');
        await page.goto('https://www.palaciodosleiloes.com.br/', { waitUntil: 'networkidle2', timeout: 60000 });

        const content = await page.content();
        fs.writeFileSync('palacio_home_dump.html', content);
        console.log('Dump saved to palacio_home_dump.html');

    } catch (e) {
        console.error(e);
    } finally {
        await browser.close();
    }
})();
