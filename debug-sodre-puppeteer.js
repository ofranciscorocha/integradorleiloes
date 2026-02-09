import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import fs from 'fs';

puppeteer.use(StealthPlugin());

const debug = async () => {
    console.log('Iniciando Puppeteer Sodré STEALTH...');
    const browser = await puppeteer.launch({
        headless: "new",
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--window-size=1920,1080',
            '--disable-blink-features=AutomationControlled'
        ]
    });

    try {
        const page = await browser.newPage();
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

        const url = 'https://www.sodresantoro.com.br/veiculos/lotes?sort=auction_date_init_asc'; // URL do usuário
        console.log(`Navegando para: ${url}`);

        await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });

        console.log('Página carregada. Esperando 10 segundos para renderização...');
        await new Promise(r => setTimeout(r, 10000));

        const title = await page.title();
        console.log(`Título: ${title}`);

        // Tenta achar quantidade de itens (seletor de chute para log)
        const items = await page.evaluate(() => document.querySelectorAll('*[class*="lote"], *[class*="card"]').length);
        console.log(`Elementos 'lote'/'card' encontrados: ${items}`);

        await page.screenshot({ path: 'sodre-result.png', fullPage: true });
        console.log('Screenshot salvo em sodre-result.png');

        const html = await page.content();
        fs.writeFileSync('sodre-result.html', html);
        console.log(`HTML salvo em sodre-result.html (${html.length} bytes)`);

    } catch (e) {
        console.error('Erro:', e.message);
    } finally {
        await browser.close();
    }
};

debug();
