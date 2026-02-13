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

        console.log('Navigating to VIP Homepage...');
        await page.goto('https://www.vipleiloes.com.br/', { waitUntil: 'networkidle2', timeout: 60000 });
        await new Promise(r => setTimeout(r, 5000));

        const links = await page.evaluate(() => {
            return Array.from(document.querySelectorAll('a'))
                .map(a => ({ text: a.innerText.trim(), href: a.href }))
                .filter(a => a.href.includes('vipleiloes.com.br'));
        });

        fs.writeFileSync('vip_links.json', JSON.stringify(links, null, 2));
        console.log(`Saved ${links.length} links to vip_links.json`);

    } catch (e) {
        console.error('Error:', e.message);
    } finally {
        await browser.close();
    }
})();
