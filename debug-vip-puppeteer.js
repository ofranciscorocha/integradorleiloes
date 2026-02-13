
import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';

puppeteer.use(StealthPlugin());

const debugVip = async () => {
    console.log('🚀 Starting VIP Debug (Puppeteer)...');
    const browser = await puppeteer.launch({ headless: "new", args: ['--no-sandbox'] });
    const page = await browser.newPage();

    try {
        await page.goto('https://www.vipleiloes.com.br/Veiculos', { waitUntil: 'domcontentloaded', timeout: 60000 });
        console.log('✅ Page loaded (Veiculos)');

        // Intercept API
        await page.setRequestInterception(true);
        page.on('request', req => {
            if (req.url().includes('GetLotes')) {
                console.log(`📡 API Request detected: ${req.url()}`);
                console.log('Headers:', req.headers());
                console.log('PostData:', req.postData());
            }
            req.continue();
        });

        page.on('response', async res => {
            if (res.url().includes('GetLotes')) {
                console.log(`📥 API Response: ${res.status()}`);
                try {
                    const text = await res.text();
                    console.log('Response Body (First 500 chars):', text.substring(0, 500));
                } catch (e) { console.log('Error reading response body:', e.message); }
            }
        });

        // Trigger loading (scroll or wait)
        await page.evaluate(() => window.scrollTo(0, 500));
        await new Promise(r => setTimeout(r, 10000));

    } catch (error) {
        console.error('❌ Error:', error.message);
    } finally {
        await browser.close();
    }
};

debugVip();
