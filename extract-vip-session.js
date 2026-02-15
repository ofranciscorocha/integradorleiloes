import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';

puppeteer.use(StealthPlugin());

async function getVipSession() {
    console.log("🚀 Establishing VIP session via Puppeteer...");
    const browser = await puppeteer.launch({ headless: "new" });
    const page = await browser.newPage();
    try {
        await page.goto('https://www.vipleiloes.com.br/', { waitUntil: 'networkidle2' });
        const cookies = await page.cookies();
        console.log("🍪 Cookies obtained:", JSON.stringify(cookies));

        // Test redirect source
        const content = await page.content();
        if (content.includes('itm-card')) {
            console.log("✅ itm-card found in Puppeteer!");
        }
    } catch (e) {
        console.error("❌ Puppeteer Error:", e.message);
    } finally {
        await browser.close();
    }
}

getVipSession();
