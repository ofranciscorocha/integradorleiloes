import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import fs from 'fs';

puppeteer.use(StealthPlugin());

(async () => {
    console.log('--- Inspecting Copart ---');
    const browser = await puppeteer.launch({ headless: "new" });
    const page = await browser.newPage();

    try {
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

        console.log('Navigating to Copart Search...');
        // Using the URL from the crawler
        await page.goto('https://www.copart.com.br/lotSearchResults?free=true&query=&page=1', { waitUntil: 'networkidle2', timeout: 60000 });

        console.log('Waiting for content...');
        await new Promise(r => setTimeout(r, 10000));

        // Dump image info
        const images = await page.evaluate(() => {
            const imgs = document.querySelectorAll('table#serverSideDataTable tbody tr img');
            return Array.from(imgs).map(img => ({
                src: img.src,
                dataSrc: img.getAttribute('data-src'),
                lazySrc: img.getAttribute('lazy-src'),
                ngSrc: img.getAttribute('ng-src'),
                dataOriginal: img.getAttribute('data-original'),
                outerHTML: img.outerHTML
            }));
        });

        console.log('Found Images:', images.slice(0, 5)); // Log first 5

        const html = await page.content();
        fs.writeFileSync('copart_dump.html', html);
        console.log('HTML dumped to copart_dump.html');

    } catch (e) {
        console.error('Error during inspection:', e.message);
    } finally {
        await browser.close();
    }
})();
