import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';

puppeteer.use(StealthPlugin());

const run = async () => {
    console.log('Starting Copart Pagination & Extraction Test...');

    const browser = await puppeteer.launch({
        headless: true,
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
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
        await page.setViewport({ width: 1366, height: 768 });

        // Iterate pages 1 to 3
        for (let pageNum = 1; pageNum <= 3; pageNum++) {
            console.log(`--- Page ${pageNum} ---`);
            const url = `https://www.copart.com.br/lotSearchResults?free=true&query=&page=${pageNum}`;

            try {
                await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
                await page.waitForSelector('table#serverSideDataTable tbody tr', { timeout: 20000 });

                const items = await page.evaluate(() => {
                    const rows = document.querySelectorAll('table#serverSideDataTable tbody tr');
                    const results = [];

                    rows.forEach(row => {
                        const linkEl = row.querySelector('a[data-uname="lotsearchLotnumber"]');
                        if (!linkEl) return;

                        const registro = linkEl.textContent.trim();

                        // Image
                        const imgEl = row.querySelector('img[data-uname="lotsearchLotimage"]');
                        let fotoUrl = '';
                        if (imgEl) {
                            fotoUrl = imgEl.getAttribute('lazy-src') ||
                                imgEl.getAttribute('data-original') ||
                                imgEl.getAttribute('data-src') ||
                                imgEl.getAttribute('ng-src') ||
                                imgEl.src;
                        }

                        results.push({ registro, fotoUrl: fotoUrl ? fotoUrl.substring(0, 50) + '...' : 'NO IMAGE' });
                    });
                    return results;
                });

                console.log(`Page ${pageNum} items: ${items.length}`);
                if (items.length > 0) {
                    console.log('Sample item:', items[0]);
                }

            } catch (error) {
                console.error(`Error on page ${pageNum}:`, error.message);
            }
        }

    } catch (error) {
        console.error('Error during test:', error);
    } finally {
        await browser.close();
    }
};

run();
