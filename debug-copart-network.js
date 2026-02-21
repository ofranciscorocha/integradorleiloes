import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import fs from 'fs';

puppeteer.use(StealthPlugin());

(async () => {
    const browser = await puppeteer.launch({
        headless: "new",
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
    });
    const page = await browser.newPage();

    console.log('Intercepting Copart network requests...');

    page.on('request', request => {
        if (['xhr', 'fetch', 'script'].includes(request.resourceType())) {
            // Copart often uses specific API endpoints, look for 'search', 'results', or 'query'
            if (request.url().includes('search') || request.url().includes('results') || request.url().includes('api')) {
                console.log('>> Request:', request.url());
            }
        }
    });

    page.on('requestfinished', async request => {
        if (['xhr', 'fetch'].includes(request.resourceType())) {
            if (request.url().includes('search') || request.url().includes('results') || request.url().includes('api')) {
                try {
                    const response = await request.response();
                    // Check if response is JSON
                    const contentType = response.headers()['content-type'];
                    if (contentType && contentType.includes('application/json')) {
                        const json = await response.json();
                        console.log(`<< JSON Response [${request.url()}]: keys=${Object.keys(json)}`);
                        fs.writeFileSync('copart_api_response.json', JSON.stringify(json, null, 2));
                        console.log('Saved response to copart_api_response.json');
                    }
                } catch (err) {
                    // ignore errors for non-json or failed reads
                }
            }
        }
    });

    try {
        await page.goto('https://www.copart.com.br/lot-search-results?query=', { waitUntil: 'networkidle0', timeout: 60000 });
        console.log('Page loaded.');
    } catch (error) {
        console.error('Error:', error);
    } finally {
        await browser.close();
    }
})();
