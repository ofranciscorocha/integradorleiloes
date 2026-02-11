import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';

puppeteer.use(StealthPlugin());

(async () => {
    const browser = await puppeteer.launch({
        headless: "new",
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    const page = await browser.newPage();

    console.log('Capturing ALL network responses...');

    page.on('response', async response => {
        const url = response.url();
        const type = response.headers()['content-type'] || '';

        if (type.includes('json') || url.includes('api') || url.includes('json')) {
            try {
                const text = await response.text();
                // Check if it looks like vehicle data
                if (text.includes('lote') || text.includes('veiculo') || text.includes('Carro') || text.length > 500) {
                    console.log(`\n🔹 URL: ${url}`);
                    console.log(`   Type: ${type}`);
                    console.log(`   Size: ${text.length}`);
                    console.log(`   Preview: ${text.substring(0, 200)}...`);
                }
            } catch (e) {
                // ignore
            }
        }
    });

    try {
        await page.goto('https://www.rogeriomenezes.com.br/leilao/1493', { waitUntil: 'networkidle2', timeout: 60000 });
        console.log('Page loaded. Waiting 10s...');
        await new Promise(r => setTimeout(r, 10000));

        // Scroll
        await page.evaluate(() => window.scrollBy(0, 500));
        await new Promise(r => setTimeout(r, 5000));

    } catch (e) {
        console.error(e);
    } finally {
        await browser.close();
    }
})();
