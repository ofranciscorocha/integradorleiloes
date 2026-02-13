import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import fs from 'fs';

puppeteer.use(StealthPlugin());

(async () => {
    console.log('🚀 Starting VIP Debug...');
    const browser = await puppeteer.launch({
        headless: "new",
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    try {
        const page = await browser.newPage();
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36');

        console.log('Navigating to https://www.vipleiloes.com.br...');
        await page.goto('https://www.vipleiloes.com.br', { waitUntil: 'networkidle2', timeout: 60000 });

        console.log('Waiting for .card-anuncio...');
        try {
            await page.waitForSelector('.card-anuncio', { timeout: 20000 });
            console.log('✅ Selector found!');
        } catch (e) {
            console.log('❌ Selector timeout!');
        }

        // Take screenshot
        await page.screenshot({ path: 'vip_debug.png', fullPage: true });
        console.log('📸 Screenshot saved to vip_debug.png');

        // Check content
        const html = await page.content();
        console.log(`📄 HTML length: ${html.length}`);

        const cards = await page.$$('.card-anuncio');
        console.log(`🔍 Cards found: ${cards.length}`);

        // Dump first card HTML if found
        if (cards.length > 0) {
            const firstCard = await page.evaluate(el => el.outerHTML, cards[0]);
            console.log('First card HTML:', firstCard.substring(0, 500));
        }

    } catch (error) {
        console.error('❌ Error:', error);
    } finally {
        await browser.close();
    }
})();
