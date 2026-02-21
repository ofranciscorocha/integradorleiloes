
import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import { getExecutablePath, getCommonArgs } from './src/utils/browser.js';

puppeteer.use(StealthPlugin());

(async () => {
    let browser;
    try {
        browser = await puppeteer.launch({
            executablePath: getExecutablePath(),
            headless: true,
            args: getCommonArgs()
        });

        const page = await browser.newPage();
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36');

        console.log('--- NAVIGATING TO FREITAS SEARCH ---');
        await page.goto('https://www.freitasleiloeiro.com.br/Leiloes/PesquisarLotes?Categoria=1', { waitUntil: 'networkidle2' });

        const cards = await page.evaluate(() => {
            return Array.from(document.querySelectorAll('.cardLote, .lote-item, [class*="card"]')).map((card, i) => {
                const img = card.querySelector('img');
                const link = card.querySelector('a');
                return {
                    index: i,
                    classes: card.className,
                    hasImgTag: !!img,
                    imgSrc: img ? img.src : null,
                    link: link ? link.href : null,
                    htmlSnippet: card.innerHTML.substring(0, 500)
                };
            }).slice(0, 5);
        });

        console.log('Cards Snapshot:', JSON.stringify(cards, null, 2));

        if (cards.length > 0 && cards[0].link) {
            console.log(`--- VISITING DETAIL PAGE: ${cards[0].link} ---`);
            await page.goto(cards[0].link, { waitUntil: 'networkidle2' });

            const detailInfo = await page.evaluate(() => {
                const title = document.querySelector('h1')?.innerText;
                const images = Array.from(document.querySelectorAll('img')).map(img => img.src).filter(s => s && (s.includes('LeiloesLotes') || s.includes('cdn')));
                const description = document.querySelector('.lote-descricao, #descricao, .info-lote, .detalhe-lote')?.innerText;

                // Try to find specific details
                const findDetail = (text) => {
                    const el = Array.from(document.querySelectorAll('li, div, p')).find(e => e.innerText.includes(text));
                    return el ? el.innerText : null;
                };

                return {
                    title,
                    imageCount: images.length,
                    images: images.slice(0, 5),
                    descriptionSnippet: description?.substring(0, 1000),
                    ano: findDetail('Ano:'),
                    condicao: findDetail('Condição:') || findDetail('Estado:'),
                    combustivel: findDetail('Combustível:')
                };
            });
            console.log('Detail Info:', JSON.stringify(detailInfo, null, 2));
        }

    } catch (e) {
        console.error('DIAGNOSE ERROR:', e);
    } finally {
        if (browser) await browser.close();
    }
})();
