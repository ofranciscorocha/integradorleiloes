import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import { getExecutablePath, getCommonArgs } from '../src/utils/browser.js';

puppeteer.use(StealthPlugin());

async function testVIP(url) {
    console.log(`Testing VIP: ${url}`);
    const browser = await puppeteer.launch({
        executablePath: getExecutablePath(),
        headless: 'new',
        args: getCommonArgs()
    });

    const page = await browser.newPage();
    try {
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36');
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });

        // Wait longer for full loading
        await new Promise(r => setTimeout(r, 10000));

        const html = await page.content();
        import('fs').then(fs => fs.writeFileSync('scripts/vip_dump.html', html));
        console.log('HTML saved to scripts/vip_dump.html');

        const data = await page.evaluate(() => {
            const photos = [];
            // VIP refined gallery
            document.querySelectorAll('.carousel-item img, .offer-thumb').forEach(img => {
                const src = img.src || img.getAttribute('data-src');
                if (src && src.startsWith('http') && !photos.includes(src)) {
                    photos.push(src);
                }
            });

            const v = (sel) => document.querySelector(sel)?.innerText?.trim() || '';

            // Refined price selectors
            const lanceAtual = v('[data-bind-valoratual]') || v('.offer-value h2');
            const incremento = v('[data-bind-incremento]');
            const status = v('[data-bind-situacaonome]');

            // Extract details from table columns
            const specs = {};
            document.querySelectorAll('.offer-two-columns table tr').forEach(tr => {
                const th = tr.querySelector('th');
                const td = tr.querySelector('td');
                if (th && td) {
                    specs[th.innerText.trim()] = td.innerText.trim();
                }
            });

            return { photos, lanceAtual, incremento, status, specs };
        });

        console.log('EXTRACTED DATA:', JSON.stringify(data, null, 2));
    } catch (e) {
        console.error('Error:', e.message);
    } finally {
        await browser.close();
    }
}

// Get a recent lot URL from search
async function findLot() {
    // Explicitly using a known URL for testing
    return 'https://www.vipleiloes.com.br/evento/anuncio/chevrolet-onix-10mt-lt2-98838';
}

(async () => {
    const lotUrl = await findLot();
    if (lotUrl) {
        await testVIP(lotUrl);
    } else {
        console.log('Could not find a lot URL');
    }
})();
