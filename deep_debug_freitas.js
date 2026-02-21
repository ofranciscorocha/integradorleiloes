
import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import { getExecutablePath, getCommonArgs } from './src/utils/browser.js';
import fs from 'fs';

puppeteer.use(StealthPlugin());

async function debugFreitasFinal() {
    const browser = await puppeteer.launch({
        executablePath: getExecutablePath(),
        headless: true,
        args: getCommonArgs()
    });

    const page = await browser.newPage();
    await page.setViewport({ width: 1366, height: 768 });
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36');

    try {
        console.log('Navigating to Category 1...');
        await page.goto('https://www.freitasleiloeiro.com.br/Leiloes/PesquisarLotes?Categoria=1', { waitUntil: 'networkidle2' });

        await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
        await new Promise(r => setTimeout(r, 2000));

        const html = await page.content();
        fs.writeFileSync('freitas_debug_final.html', html);

        const info = await page.evaluate(() => {
            const cards = Array.from(document.querySelectorAll('.cardlote, .cardLote, .lote-item'));
            return cards.map(card => {
                const imgs = Array.from(card.querySelectorAll('img')).map(img => ({
                    src: img.src,
                    class: img.className,
                    visible: img.offsetWidth > 0,
                    dataSrc: img.getAttribute('data-src')
                }));
                const title = card.innerText.substring(0, 100);
                return { title, imgs };
            });
        });

        console.log('--- CARDS FOUND: ' + info.length + ' ---');
        info.slice(0, 5).forEach((item, i) => {
            console.log(`Card ${i}: ${item.title.replace(/\n/g, ' ')}`);
            item.imgs.forEach(img => {
                console.log(`  Img: ${img.src} (Class: ${img.class}, DataSrc: ${img.dataSrc})`);
            });
        });

    } catch (e) {
        console.error(e);
    } finally {
        await browser.close();
    }
}

debugFreitasFinal();
