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

        page.on('response', async response => {
            const url = response.url();
            // Log ALL JSON responses to find where the data is
            if (response.headers()['content-type']?.includes('json')) {
                try {
                    const data = await response.json();
                    console.log(`\n🔹 Intercepted JSON from ${url}`);
                    const strKey = JSON.stringify(data).substring(0, 200);
                    console.log(`   Preview: ${strKey}`);

                    // Filter for potential lists
                    const list = Array.isArray(data) ? data : (data.data || data.items || data.lotes || data.lots || []);
                    if (Array.isArray(list) && list.length > 0) {
                        console.log(`   ✅ FOUND LIST with ${list.length} Items! Saving sample.`);
                        fs.writeFileSync('sodre-sample-full.json', JSON.stringify(list, null, 2));
                    }
                } catch (e) { }
            }
        });

        const url = 'https://www.sodresantoro.com.br/veiculos/lotes?sort=lot_visits_desc';
        console.log(`Navigating to ${url}...`);
        await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });

        // Scroll a bit
        await page.evaluate(async () => {
            window.scrollBy(0, 500);
            await new Promise(r => setTimeout(r, 1000));
            window.scrollBy(0, 500);
        });

        console.log('Done.');

    } catch (e) {
        console.error(e);
    } finally {
        await browser.close();
    }
})();
