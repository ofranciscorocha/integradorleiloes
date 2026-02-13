import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

puppeteer.use(StealthPlugin());

(async () => {
    const browser = await puppeteer.launch({ headless: "new", args: ['--no-sandbox'] });
    const page = await browser.newPage();
    const filePath = 'file://' + path.join(__dirname, 'palacio_home_dump.html').replace(/\\/g, '/');

    console.log(`Opening local file: ${filePath}`);
    await page.goto(filePath);

    const data = await page.evaluate(() => {
        const links = Array.from(document.querySelectorAll('a'))
            .filter(a => a.href.includes('leilao_pesquisa'))
            .map(a => ({ text: a.innerText.trim(), href: a.href }));

        const inputs = Array.from(document.querySelectorAll('input'))
            .filter(i => i.name && i.name.includes('leilao_pesquisa'))
            .map(i => ({ name: i.name, value: i.value }));

        return { links, inputs };
    });

    console.log('Links found:', JSON.stringify(data.links, null, 2));
    console.log('Inputs found:', JSON.stringify(data.inputs, null, 2));

    await browser.close();
})();
