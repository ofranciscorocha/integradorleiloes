import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import fs from 'fs';

puppeteer.use(StealthPlugin());

(async () => {
    console.log('--- Inspecting VIP Leilões (Robust) ---');
    const browser = await puppeteer.launch({
        headless: "new",
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    try {
        const page = await browser.newPage();
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36');

        console.log('Navigating...');
        await page.goto('https://www.vipleiloes.com.br/pesquisa?OrdenacaoVeiculo=DataInicio', { waitUntil: 'domcontentloaded', timeout: 60000 });

        console.log('Waiting for .card-anuncio or 10s...');
        try {
            await page.waitForSelector('.card-anuncio', { timeout: 10000 });
            console.log('Card anuncio found!');
        } catch (e) {
            console.log('Card anuncio NOT found within timeout.');
        }

        const html = await page.content();
        fs.writeFileSync('vip_dump_robust.html', html);
        console.log(`Dumped HTML (${html.length} bytes)`);

    } catch (e) {
        console.error('Fatal error:', e);
    } finally {
        await browser.close();
    }
})();
