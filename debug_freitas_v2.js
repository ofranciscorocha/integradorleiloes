
import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import { getExecutablePath, getCommonArgs } from './src/utils/browser.js';
import fs from 'fs';

puppeteer.use(StealthPlugin());

const BASE_URL = 'https://www.freitasleiloeiro.com.br';

async function debugFreitas() {
    const browser = await puppeteer.launch({
        executablePath: getExecutablePath(),
        headless: true,
        args: getCommonArgs()
    });

    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36');

    try {
        console.log('Navigating to Freitas search page (category 1)...');
        await page.goto(`${BASE_URL}/Leiloes/PesquisarLotes?Categoria=1`, { waitUntil: 'networkidle2', timeout: 60000 });

        // Take a screenshot or dump HTML
        const html = await page.content();
        fs.writeFileSync('freitas_search.html', html);
        console.log('Saved freitas_search.html');

        const auctions = await page.evaluate(() => {
            const links = [];
            document.querySelectorAll('a[href*="Leilao="]').forEach(a => {
                links.push({ text: a.innerText.trim(), href: a.href });
            });
            return links;
        });

        console.log(`Found ${auctions.length} auction links.`);
        if (auctions.length > 0) {
            console.log('First auction:', auctions[0]);

            console.log('Navigating to first auction...');
            await page.goto(auctions[0].href, { waitUntil: 'networkidle2', timeout: 60000 });

            const cards = await page.evaluate(() => {
                return document.querySelectorAll('.cardlote, .cardLote, .lote-item').length;
            });
            console.log(`Found ${cards} cards on auction page.`);

            const lotHtml = await page.content();
            fs.writeFileSync('freitas_auction.html', lotHtml);
            console.log('Saved freitas_auction.html');
        }

    } catch (e) {
        console.error('Error:', e);
    } finally {
        await browser.close();
    }
}

debugFreitas();
