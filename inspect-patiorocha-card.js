import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import fs from 'fs';

puppeteer.use(StealthPlugin());

(async () => {
    const browser = await puppeteer.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
    });
    const page = await browser.newPage();

    try {
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
        await page.goto('https://www.patiorochaleiloes.com.br/lotes/search?tipo=veiculo', { waitUntil: 'networkidle2', timeout: 90000 });
        await page.waitForSelector('.card', { timeout: 15000 });

        const cardHtml = await page.evaluate(() => {
            const card = document.querySelector('.card');
            return card ? card.innerHTML : 'Not found';
        });

        fs.writeFileSync('patiorocha_card_full.html', cardHtml);
        console.log('Full card HTML dumped.');

    } catch (e) {
        console.error('Error:', e.message);
    } finally {
        await browser.close();
    }
})();
