
import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';

puppeteer.use(StealthPlugin());

const debugVipFull = async () => {
    console.log('🚀 Starting VIP Full Debug...');
    const browser = await puppeteer.launch({ headless: "new", args: ['--no-sandbox'] });
    const page = await browser.newPage();

    const requests = [];

    try {
        await page.setRequestInterception(true);
        page.on('request', req => {
            const url = req.url();
            if (url.includes('api') || url.includes('json') || url.includes('lote') || url.includes('veiculo')) {
                console.log(`📡 Req: ${url}`);
                requests.push(url);
            }
            req.continue();
        });

        console.log('Navigating to https://www.vipleiloes.com.br/Veiculos...');
        await page.goto('https://www.vipleiloes.com.br/Veiculos', { waitUntil: 'networkidle2', timeout: 60000 });
        console.log('✅ Page loaded');

        // Scroll to trigger lazy load
        await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
        await new Promise(r => setTimeout(r, 5000));

    } catch (e) {
        console.error('❌ Error:', e.message);
    } finally {
        await browser.close();
    }
};

debugVipFull();
