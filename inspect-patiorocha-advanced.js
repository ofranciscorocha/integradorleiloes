import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import fs from 'fs';

puppeteer.use(StealthPlugin());

(async () => {
    console.log('--- Inspecting Pátio Rocha Leilões (Advanced) ---');
    const browser = await puppeteer.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
    });
    const page = await browser.newPage();

    try {
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

        console.log('Navigating to Pátio Rocha Search...');
        await page.goto('https://www.patiorochaleiloes.com.br/lotes/search?tipo=veiculo', { waitUntil: 'networkidle2', timeout: 90000 });

        // Wait for content
        await page.waitForSelector('.card', { timeout: 15000 }).catch(() => console.log('Timeout waiting for .card'));

        const data = await page.evaluate(() => {
            const cards = document.querySelectorAll('.card');
            return Array.from(cards).slice(0, 3).map(card => {
                const img = card.querySelector('img');
                const title = card.querySelector('.card-title')?.innerText || card.querySelector('h3')?.innerText || card.querySelector('h5')?.innerText;
                const badges = Array.from(card.querySelectorAll('.badge')).map(b => b.innerText.trim());
                const footer = card.querySelector('.card-footer')?.innerText;
                const link = card.querySelector('a')?.href;

                return {
                    title,
                    img_src: img?.src,
                    img_data_src: img?.getAttribute('data-src'),
                    img_alt: img?.alt,
                    badges,
                    footer,
                    link,
                    full_html: card.outerHTML.substring(0, 1000) // snippet
                };
            });
        });

        console.log('EXTRACTED DATA:', JSON.stringify(data, null, 2));
        fs.writeFileSync('patiorocha_advanced_dump.json', JSON.stringify(data, null, 2));

        await page.screenshot({ path: 'patiorocha_advanced.png', fullPage: false });

    } catch (e) {
        console.error('Error during inspection:', e.message);
    } finally {
        await browser.close();
    }
})();
