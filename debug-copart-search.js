import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import fs from 'fs';

puppeteer.use(StealthPlugin());

const run = async () => {
    console.log('Starting Copart debug...');

    // Launch browser
    const browser = await puppeteer.launch({
        headless: true, // Use headless=false if you want to see the browser (on desktop)
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-accelerated-2d-canvas',
            '--no-first-run',
            '--no-zygote',
            '--single-process',
            '--disable-gpu'
        ]
    });

    try {
        const page = await browser.newPage();

        // Emulate a real user agent
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

        // Define viewport
        await page.setViewport({ width: 1366, height: 768 });

        // Navigate to search page
        const url = 'https://www.copart.com.br/lotSearchResults?free=true&query=&page=1';
        console.log(`Navigating to ${url}...`);

        await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });
        console.log('Page loaded (networkidle2).');

        // Wait a bit for JS to render
        await new Promise(r => setTimeout(r, 5000));

        // Screenshot
        await page.screenshot({ path: 'copart_debug_search.png', fullPage: true });
        console.log('Screenshot saved to copart_debug_search.png');

        // HTML Dump
        const html = await page.content();
        fs.writeFileSync('copart_debug_search.html', html);
        console.log('HTML saved to copart_debug_search.html');

        // Try to select items
        const items = await page.evaluate(() => {
            const rows = document.querySelectorAll('table#serverSideDataTable tbody tr');
            return Array.from(rows).map(row => {
                const linkEl = row.querySelector('a[data-uname="lotsearchLotnumber"]');
                return linkEl ? linkEl.textContent.trim() : 'No Link';
            });
        });

        console.log(`Found ${items.length} items:`, items);

    } catch (error) {
        console.error('Error:', error);
    } finally {
        await browser.close();
    }
};

run();
