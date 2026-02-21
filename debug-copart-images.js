
import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import fs from 'fs';

puppeteer.use(StealthPlugin());

(async () => {
    console.log('🐞 Debugging Copart Images...');
    const browser = await puppeteer.launch({
        headless: true, // Use headless for speed, or false if we need to see it
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    const page = await browser.newPage();

    // Mock user agent
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36');
    await page.setViewport({ width: 1366, height: 768 });

    const url = 'https://www.copart.com.br/lotSearchResults?free=true&query=&page=1';
    console.log(`Navigating to ${url}...`);

    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 90000 });

    try {
        await page.waitForSelector('table#serverSideDataTable tbody tr', { timeout: 15000 });
    } catch (e) {
        console.log('Timeout waiting for table.');
    }

    // Dump HTML of first 5 items specific to images
    const debugData = await page.evaluate(() => {
        const rows = Array.from(document.querySelectorAll('table#serverSideDataTable tbody tr')).slice(0, 10);
        return rows.map((row, i) => {
            const imgEl = row.querySelector('img[data-uname="lotsearchLotimage"]');
            const linkEl = row.querySelector('a[data-uname="lotsearchLotnumber"]');
            const title = linkEl ? linkEl.textContent.trim() : 'Unknown';

            if (!imgEl) return { i, title, error: 'Img element not found' };

            // log all attributes
            const attrs = {};
            for (const attr of imgEl.attributes) {
                attrs[attr.name] = attr.value;
            }
            return { i, title, attrs, outerHTML: imgEl.outerHTML };
        });
    });

    console.log('🔍 Image Elements Data:');
    console.log(JSON.stringify(debugData, null, 2));

    await browser.close();
})();
