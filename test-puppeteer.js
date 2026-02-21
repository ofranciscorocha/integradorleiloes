
import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import { getExecutablePath, getCommonArgs } from './src/utils/browser.js';

puppeteer.use(StealthPlugin());

async function testScrape() {
    console.log('🚀 Starting Puppeteer test...');
    const browser = await puppeteer.launch({
        headless: true,
        executablePath: getExecutablePath(),
        args: getCommonArgs()
    });

    try {
        const page = await browser.newPage();
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36');

        console.log('🔍 Navigating to tabelafipebrasil.com...');
        await page.goto('https://www.tabelafipebrasil.com/placa/GAC7C32', { waitUntil: 'networkidle2', timeout: 30000 });

        const title = await page.title();
        console.log('✅ Page Title:', title);

        const exists = await page.evaluate(() => document.body.innerText.includes('MERCEDES-BENZ'));
        console.log('✅ Data found?', exists);

        if (exists) {
            const data = await page.evaluate(() => {
                const results = {};
                document.querySelectorAll('.fipeTablePriceDetail tr').forEach(tr => {
                    const tds = tr.querySelectorAll('td');
                    if (tds.length >= 2) results[tds[0].innerText.replace(':', '').trim()] = tds[1].innerText.trim();
                });
                return results;
            });
            console.log('📦 Extracted Data:', data);
        }

    } catch (e) {
        console.error('❌ Scrape Failed:', e.message);
    } finally {
        await browser.close();
    }
}

testScrape();
