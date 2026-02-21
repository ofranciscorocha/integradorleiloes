import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';

puppeteer.use(StealthPlugin());

(async () => {
    const browser = await puppeteer.launch({
        headless: "new",
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    const page = await browser.newPage();
    await page.setViewport({ width: 1366, height: 768 });

    // Test VIP - Page 2
    console.log('Testing VIP Page 2...');
    await page.goto('https://www.vipleiloes.com.br/pesquisa?OrdenacaoVeiculo=DataInicio&pageNumber=2', { waitUntil: 'networkidle2', timeout: 60000 });
    const vipContent = await page.content();
    if (vipContent.includes('card-anuncio')) {
        const firstItem = await page.$eval('.card-anuncio .anc-title h1', el => el.textContent.trim()).catch(() => 'Unknown');
        console.log(`VIP Page 2 loaded. First item: ${firstItem}`);
    } else {
        console.log('VIP Page 2 did not load items (or selector failed).');
    }

    // Test Copart - Page 2
    console.log('Testing Copart Page 2...');
    await page.goto('https://www.copart.com.br/lotSearchResults/?free=true&query=&page=2', { waitUntil: 'networkidle2', timeout: 60000 });
    try {
        await page.waitForSelector('table#serverSideDataTable tbody tr', { timeout: 10000 });
        const copartItem = await page.$eval('table#serverSideDataTable tbody tr a[data-uname="lotsearchLotnumber"]', el => el.textContent.trim());
        console.log(`Copart Page 2 loaded. First item: ${copartItem}`);
    } catch {
        console.log('Copart Page 2 failed to load table.');
    }

    await browser.close();
})();
