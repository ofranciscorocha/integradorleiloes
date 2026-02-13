import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import fs from 'fs';

puppeteer.use(StealthPlugin());

(async () => {
    const browser = await puppeteer.launch({ headless: "new", args: ['--no-sandbox'] });
    const page = await browser.newPage();
    try {
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36');

        // 1. Visit Home to get IDs
        console.log('Navigating to Palacio Home...');
        await page.goto('https://www.palaciodosleiloes.com.br/', { waitUntil: 'networkidle2', timeout: 60000 });

        const auctionIds = await page.evaluate(() => {
            return Array.from(document.querySelectorAll('input[name="leilao_pesquisa[]"]'))
                .map(input => input.value);
        });

        console.log('Auction IDs found:', auctionIds);

        if (auctionIds.length === 0) {
            console.log('No auction IDs found. Exiting.');
            return;
        }

        const testId = auctionIds[0];
        const testUrl = `https://www.palaciodosleiloes.com.br/site/leilao.php?leilao_pesquisa=${testId}`;
        console.log(`Testing URL: ${testUrl}`);

        await page.goto(testUrl, { waitUntil: 'networkidle2', timeout: 60000 });

        // Dump the result
        const content = await page.content();
        fs.writeFileSync('palacio_auction_dump.html', content);
        console.log('Auction page dump saved.');

        // Check for items
        const items = await page.evaluate(() => {
            const cards = document.querySelectorAll('.col-md-3, .lote-item, .card, .item-lote'); // Try generic classes
            return cards.length;
        });
        console.log(`Items found on auction page: ${items}`);

    } catch (e) {
        console.error(e);
    } finally {
        await browser.close();
    }
})();
