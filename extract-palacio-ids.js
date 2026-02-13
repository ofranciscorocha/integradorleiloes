
import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';

puppeteer.use(StealthPlugin());

const extractPalacioIds = async () => {
    console.log('🚀 Starting Palácio ID Extraction (Root URL)...');
    const browser = await puppeteer.launch({ headless: "new", args: ['--no-sandbox'] });
    const page = await browser.newPage();

    try {
        await page.goto('https://www.palaciodosleiloes.com.br/', { waitUntil: 'domcontentloaded', timeout: 60000 });
        console.log('✅ Page loaded (Homepage)');

        // Wait for AJAX content
        await new Promise(r => setTimeout(r, 8000));

        const ids = await page.evaluate(() => {
            const found = [];
            // Look for links with leilao_pesquisa=ID
            document.querySelectorAll('a').forEach(a => {
                const m = (a.href || '').match(/leilao_pesquisa=(\d+)/);
                if (m) found.push(m[1]);
            });
            // Look for inputs
            document.querySelectorAll('input').forEach(i => {
                if (i.name && i.name.includes('leilao_pesquisa')) found.push(i.value);
            });
            return [...new Set(found)];
        });

        console.log(`🔍 Found IDs: ${ids.join(', ')}`);

        if (ids.length === 0) {
            console.log('⚠️ No IDs found. Dumping Links...');
            const links = await page.evaluate(() => Array.from(document.querySelectorAll('a')).map(a => a.href).filter(h => h.includes('leilao')));
            console.log(links.slice(0, 10).join('\n'));
        }

    } catch (error) {
        console.error('❌ Error:', error.message);
    } finally {
        await browser.close();
    }
};

extractPalacioIds();
