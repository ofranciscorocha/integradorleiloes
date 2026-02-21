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

    console.log('Intercepting VIP network requests...');

    // Log all XHR/Fetch requests
    page.on('request', request => {
        if (request.resourceType() === 'xhr' || request.resourceType() === 'fetch') {
            // Filter for likely relevant endpoints
            if (request.url().includes('pesquisa') || request.url().includes('handler')) {
                console.log('>> Request:', request.url());
            }
        }
    });

    page.on('requestfinished', async request => {
        if (request.resourceType() === 'xhr' || request.resourceType() === 'fetch') {
            if (request.url().includes('pesquisa') || request.url().includes('handler')) {
                try {
                    const response = await request.response();
                    const body = await response.text();
                    console.log(`<< Response [${request.url()}]:`, body.substring(0, 500) + '...'); // Log first 500 chars

                    // Save full response to file for analysis
                    fs.writeFileSync('vip_api_response.json', body);
                    console.log('Saved response to vip_api_response.json');
                } catch (err) {
                    console.log('Error reading response:', err.message);
                }
            }
        }
    });

    try {
        await page.goto('https://www.vipleiloes.com.br/pesquisa?SortOrder=DataInicio', { waitUntil: 'networkidle0', timeout: 60000 });
        console.log('Page loaded. waiting for extra activity...');

        // Scroll to trigger potential lazy loading or click next page if visible
        // But for now, just seeing the initial load is good.

    } catch (error) {
        console.error('Error:', error);
    } finally {
        await browser.close();
    }
})();
