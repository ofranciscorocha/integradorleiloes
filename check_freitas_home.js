
import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import { getExecutablePath, getCommonArgs } from './src/utils/browser.js';

puppeteer.use(StealthPlugin());

async function checkHomepage() {
    console.log('Starting browser...');
    const browser = await puppeteer.launch({
        executablePath: getExecutablePath(),
        headless: true,
        args: getCommonArgs()
    });

    const page = await browser.newPage();
    await page.setViewport({ width: 1366, height: 768 });
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36');

    try {
        console.log('Navigating to Homepage...');
        await page.goto('https://www.freitasleiloeiro.com.br/', { waitUntil: 'networkidle2', timeout: 60000 });

        const data = await page.evaluate(() => {
            const links = Array.from(document.querySelectorAll('a'))
                .map(a => ({ text: a.innerText.trim(), href: a.href }))
                .filter(l => l.text.length > 2);
            return links;
        });

        console.log('Links found:');
        data.forEach(l => {
            if (l.text.toUpperCase().includes('VEIC') || l.href.includes('Categoria=1')) {
                console.log(`- ${l.text}: ${l.href}`);
            }
        });

    } catch (e) {
        console.error('Error:', e);
    } finally {
        await browser.close();
    }
}

checkHomepage();
