
import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import { getExecutablePath, getCommonArgs } from './src/utils/browser.js';
import fs from 'fs';

puppeteer.use(StealthPlugin());

async function checkLoadMore() {
    console.log('Starting browser...');
    const browser = await puppeteer.launch({
        executablePath: getExecutablePath(),
        headless: true, // headless: false might be better for debugging but I'm an agent
        args: getCommonArgs()
    });

    const page = await browser.newPage();
    await page.setViewport({ width: 1366, height: 768 });
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36');

    try {
        console.log('Navigating to Category 1...');
        const url = 'https://www.freitasleiloeiro.com.br/Leiloes/PesquisarLotes?Categoria=1';
        await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });
        console.log('Navigation done.');

        const content = await page.content();
        fs.writeFileSync('freitas_cat_test.html', content);
        console.log(`HTML saved, size: ${content.length}`);

        // Scrape cards
        const cards = await page.evaluate(() => document.querySelectorAll('.cardlote, .cardLote, .lote-item').length);
        console.log(`Initial cards: ${cards}`);

        // Look for buttons
        const btns = await page.evaluate(() => {
            return Array.from(document.querySelectorAll('button, a, span'))
                .filter(el => {
                    const t = (el.innerText || '').toUpperCase();
                    return t.includes('CARREGAR') || t.includes('MAIS') || t.includes('VEIC');
                })
                .map(el => ({ tag: el.tagName, text: el.innerText.trim(), id: el.id, class: el.className }));
        });
        console.log('Buttons found:', JSON.stringify(btns, null, 2));

    } catch (e) {
        console.error('Error:', e);
    } finally {
        await browser.close();
    }
}

checkLoadMore();
