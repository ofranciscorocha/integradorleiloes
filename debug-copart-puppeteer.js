import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import fs from 'fs';

puppeteer.use(StealthPlugin());

const debug = async () => {
    console.log('Iniciando Puppeteer Stealth...');
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
    const page = await browser.newPage();

    // Set viewport e user agent para parecer real
    await page.setViewport({ width: 1366, height: 768 });
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

    try {
        const url = 'https://www.copart.com.br/lotSearchResults/?free=true&query=';
        console.log(`Navegando para: ${url}`);

        await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });

        console.log('Página carregada. Aguardando tabela de resultados...');

        // Tenta esperar pelo seletor da tabela E linhas de dados
        try {
            await page.waitForSelector('#serverSideDataTable tbody tr', { timeout: 30000 });
            console.log('Tabela encontrada! Esperando dados...');

            // Espera ter mais de 2 linhas (cabeçalho + dados)
            await page.waitForFunction(() => document.querySelectorAll('#serverSideDataTable tbody tr').length > 2, { timeout: 30000 });
            console.log('Dados renderizados!');

            // Conta linhas
            const rows = await page.evaluate(() => document.querySelectorAll('#serverSideDataTable tbody tr').length);
            console.log(`Linhas encontradas: ${rows}`);

        } catch (e) {
            console.log('Timeout esperando dados da tabela:', e.message);
        }

        // Tira screenshot de teste
        await page.screenshot({ path: 'copart-result.png', fullPage: true });
        console.log('Screenshot salvo em copart-result.png');

        // Salva HTML renderizado
        const html = await page.content();
        fs.writeFileSync('copart-result.html', html);
        console.log('HTML renderizado salvo em copart-result.html');

    } catch (error) {
        console.error('Erro:', error.message);
    } finally {
        await browser.close();
        console.log('Browser fechado.');
    }
};

debug();
