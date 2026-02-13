import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import fs from 'fs';

puppeteer.use(StealthPlugin());

(async () => {
    const browser = await puppeteer.launch({
        headless: 'new',
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    try {
        // --- Sodré ---
        console.log('--- Debugging Sodré ---');
        const pageSodre = await browser.newPage();
        const sodreRequests = [];
        await pageSodre.setRequestInterception(true);
        pageSodre.on('request', (req) => {
            if (['xhr', 'fetch'].includes(req.resourceType())) {
                sodreRequests.push(req.url());
            }
            req.continue();
        });

        console.log('Navigating Sodré...');
        await pageSodre.goto('https://www.sodresantoro.com.br/veiculos/lotes?sort=lot_visits_desc', { waitUntil: 'networkidle2', timeout: 60000 });
        console.log('Waiting 5s...');
        await new Promise(r => setTimeout(r, 5000));

        fs.writeFileSync('sodre_urls.txt', sodreRequests.join('\n'));
        console.log(`Saved ${sodreRequests.length} Sodré XHR/Fetch URLs to sodre_urls.txt`);
        await pageSodre.close();

        // --- Leilo ---
        console.log('\n--- Debugging Leilo ---');
        const pageLeilo = await browser.newPage();
        console.log('Navigating Leilo...');
        await pageLeilo.goto('https://www.leilo.com.br/leilao', { waitUntil: 'networkidle2', timeout: 60000 });

        console.log('Waiting 5s...');
        await new Promise(r => setTimeout(r, 5000));

        const html = await pageLeilo.content();
        fs.writeFileSync('leilo_dump.html', html);
        console.log(`Saved Leilo HTML (${html.length} bytes) to leilo_dump.html`);
        await pageLeilo.close();

    } catch (e) {
        console.error('Error:', e.message);
    } finally {
        await browser.close();
    }
})();
