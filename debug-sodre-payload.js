import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import fs from 'fs';

puppeteer.use(StealthPlugin());

const debugPayload = async () => {
    console.log('Iniciando Interceptação Sodré...');
    const browser = await puppeteer.launch({
        headless: "new",
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--window-size=1920,1080'
        ]
    });

    try {
        const page = await browser.newPage();

        // Listener de resposta
        page.on('response', async response => {
            const url = response.url();
            const contentType = response.headers()['content-type'] || '';

            if (contentType.includes('application/json') || url.includes('api')) {
                console.log(`Interceptado JSON: ${url}`);
                try {
                    const buffer = await response.buffer();
                    // Salva se for grande o suficiente para ser lista
                    if (buffer.length > 5000) {
                        const name = `sodre-dump-${Date.now()}.json`;
                        fs.writeFileSync(name, buffer);
                        console.log(`Salvo dump JSON: ${name} (${buffer.length} bytes)`);
                    }
                } catch (e) {
                    // ignore
                }
            }
        });

        const url = 'https://www.sodresantoro.com.br/veiculos/lotes?sort=auction_date_init_asc';
        console.log(`Navegando para: ${url}`);

        await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });

        console.log('Esperando 5s extras...');
        await new Promise(r => setTimeout(r, 5000));

    } catch (e) {
        console.error('Erro:', e.message);
    } finally {
        await browser.close();
    }
};

debugPayload();
