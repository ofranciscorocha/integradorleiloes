import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import fs from 'fs';

puppeteer.use(StealthPlugin());

(async () => {
    console.log('--- Inspecting Sato Leilões (Home) ---');
    const browser = await puppeteer.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
    });
    const page = await browser.newPage();

    try {
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

        console.log('Navigating to Sato Home...');
        await page.goto('https://www.satoleiloes.com.br/', { waitUntil: 'networkidle2', timeout: 90000 });

        const html = await page.content();
        fs.writeFileSync('sato_home_dump.html', html);
        await page.screenshot({ path: 'sato_home_inspect.png' });

        const links = await page.evaluate(() => {
            return Array.from(document.querySelectorAll('a')).map(a => ({ text: a.innerText, href: a.href }));
        });
        console.log('Found links:', links.filter(l => l.text.toLowerCase().includes('leilão') || l.text.toLowerCase().includes('agenda')));

    } catch (e) {
        console.error('Error:', e.message);
    } finally {
        await browser.close();
    }
})();
