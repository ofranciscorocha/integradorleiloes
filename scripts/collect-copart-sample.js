
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
        const url = 'https://www.copart.com.br/lotSearchResults?free=true&query=&page=1&itemsPerPage=10&filter=VEHT:CAR';
        console.log('Fetching Copart search results...');
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
        await page.waitForSelector('table#serverSideDataTable tbody tr', { timeout: 30000 });

        const lotLink = await page.evaluate(() => {
            const linkEl = document.querySelector('a[data-uname="lotsearchLotnumber"]');
            return linkEl ? linkEl.href : null;
        });

        if (lotLink) {
            console.log('Found Lot Link:', lotLink);
            await page.goto(lotLink, { waitUntil: 'domcontentloaded', timeout: 60000 });
            await new Promise(r => setTimeout(r, 10000));

            const html = await page.content();
            import('fs').then(fs => fs.writeFileSync('scripts/copart_dump.html', html));
            console.log('Saved Copart lot HTML to scripts/copart_dump.html');
        } else {
            console.log('No lot found.');
        }

    } catch (e) {
        console.error('Error:', e.message);
    } finally {
        await browser.close();
    }
}

test();
