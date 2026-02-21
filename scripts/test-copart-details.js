
import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import { getExecutablePath, getCommonArgs } from '../src/utils/browser.js';

puppeteer.use(StealthPlugin());

async function test() {
    const browser = await puppeteer.launch({
        executablePath: getExecutablePath(),
        headless: 'new',
        args: getCommonArgs()
    });

    try {
        const page = await browser.newPage();
        const url = 'https://www.copart.com.br/lot/1072701';
        console.log('Fetching Copart lot details:', url);

        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
        await new Promise(r => setTimeout(r, 6000)); // Wait for Angular

        const html = await page.content();
        import('fs').then(fs => fs.writeFileSync('scripts/test_copart_live.html', html));
        console.log('Live HTML saved to scripts/test_copart_live.html');

        const data = await page.evaluate(() => {
            const v = (sel) => document.querySelector(sel)?.innerText?.trim() || '';
            const attr = (sel, at) => document.querySelector(sel)?.getAttribute(at) || '';

            // Photos from thumbnail roll - get highest res available
            const photos = [];
            document.querySelectorAll('.thumbImgblock img').forEach(img => {
                const src = img.getAttribute('hd-url') || img.getAttribute('full-url') || img.src;
                if (src && src.startsWith('http') && !photos.includes(src)) {
                    photos.push(src);
                }
            });
            // Fallback to main image
            if (photos.length === 0) {
                const main = attr('#show-img', 'hd-url') || attr('#show-img', 'src');
                if (main) photos.push(main);
            }

            // Status and Bids - Look for labels and their adjacent spans
            const findByLabel = (text) => {
                const labels = Array.from(document.querySelectorAll('.details label, .formbox label'));
                const label = labels.find(l => l.innerText.includes(text));
                if (!label) return '';
                // Try sibling or parent's sibling
                return label.nextElementSibling?.innerText?.trim() ||
                    label.parentElement?.querySelector('.lot-details-desc')?.innerText?.trim() || '';
            };

            const lanceAtualText = findByLabel('Lance Atual') || findByLabel('Venda Finalizada') || '';
            const incrementoText = findByLabel('Incremento') || '';

            const specs = {};
            // Extract all details from specification boxes
            document.querySelectorAll('.lot-details-inner .details').forEach(div => {
                const label = div.querySelector('label')?.innerText?.replace(':', '').trim();
                const value = div.querySelector('.lot-details-desc')?.innerText?.trim();
                if (label && value) specs[label] = value;
            });

            return { photos, lanceAtualText, incrementoText, specs };
        });

        console.log('--- EXTRACTED DATA ---');
        console.log('Photos Count:', data.photos.length);
        console.log('First Photo:', data.photos[0]);
        console.log('Lance Atual Text:', data.lanceAtualText);
        console.log('Incremento Text:', data.incrementoText);
        console.log('Specs Keys:', Object.keys(data.specs));
        console.log('Full Specs:', JSON.stringify(data.specs, null, 2));
        console.log('--- END ---');

    } catch (e) {
        console.error('Error:', e.message);
    } finally {
        await browser.close();
    }
}

test();
