
import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import fs from 'fs';

puppeteer.use(StealthPlugin());

(async () => {
    console.log('🐞 Debugging VIP Pagination...');
    const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
    const page = await browser.newPage();

    // Use desktop user agent
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36');
    await page.setViewport({ width: 1366, height: 768 });

    const url = 'https://www.vipleiloes.com.br/pesquisa?Pagina=1&Categorias=3&OrdenacaoVeiculo=InicioLeilao';
    console.log(`Navigating to ${url}...`);

    await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });

    // Dump HTML
    const html = await page.content();
    fs.writeFileSync('vip_debug_pagination.html', html);
    console.log('📸 HTML saved to vip_debug_pagination.html');

    // Check for total items selector
    const totalText = await page.evaluate(() => {
        const el = document.querySelector('div.col-md-12.tituloListagem h4');
        return el ? el.innerText : 'SELECTOR_NOT_FOUND';
    });
    console.log(`🔢 Total items text: "${totalText}"`);

    // Check for cards to ensure page loaded
    const cards = await page.evaluate(() => document.querySelectorAll('div.itm-card').length);
    console.log(`🃏 Cards found: ${cards}`);

    await browser.close();
})();
