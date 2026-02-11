import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import fs from 'fs';

puppeteer.use(StealthPlugin());

(async () => {
    console.log('--- Inspecting Pátio Rocha Leilões (Debug) ---');
    const browser = await puppeteer.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
    });
    const page = await browser.newPage();

    try {
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

        console.log('Navigating to Pátio Rocha...');
        await page.goto('https://www.patiorochaleiloes.com.br/', { waitUntil: 'networkidle2', timeout: 90000 });

        // Wait for cards to load
        await page.waitForSelector('.card', { timeout: 10000 }).catch(() => console.log('Timeout waiting for .card'));

        const cardsData = await page.evaluate(() => {
            const results = [];
            document.querySelectorAll('.card').forEach((card, i) => {
                if (i > 5) return; // Only first 5 for debug
                const img = card.querySelector('img');
                const title = card.querySelector('.card-title')?.innerText || card.querySelector('h3')?.innerText || card.querySelector('h5')?.innerText;
                const alt = img?.alt;
                const src = img?.src;
                const dataSrc = img?.getAttribute('data-src');
                results.push({ title, alt, src, dataSrc });
            });
            return results;
        });

        console.log('Sample data from first 5 cards:', JSON.stringify(cardsData, null, 2));

        const html = await page.content();
        fs.writeFileSync('patiorocha_debug_dump.html', html);
        await page.screenshot({ path: 'patiorocha_debug.png' });

    } catch (e) {
        console.error('Error during inspection:', e.message);
    } finally {
        await browser.close();
    }
})();
