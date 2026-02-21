
import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import { getExecutablePath, getCommonArgs } from './src/utils/browser.js';

puppeteer.use(StealthPlugin());

async function checkHome() {
    const browser = await puppeteer.launch({
        executablePath: getExecutablePath(),
        headless: true,
        args: getCommonArgs()
    });

    const page = await browser.newPage();
    try {
        await page.goto('https://www.freitasleiloeiro.com.br/', { waitUntil: 'networkidle2' });
        const links = await page.evaluate(() => {
            return Array.from(document.querySelectorAll('a'))
                .map(a => ({ text: a.innerText.trim(), href: a.href }))
                .filter(l => l.text.length > 2);
        });
        console.log(JSON.stringify(links, null, 2));
    } catch (e) {
        console.error(e);
    } finally {
        await browser.close();
    }
}
checkHome();
