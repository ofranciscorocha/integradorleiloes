import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import fs from 'fs';

puppeteer.use(StealthPlugin());

(async () => {
    console.log('--- Inspecting VIP Leilões ---');
    const browser = await puppeteer.launch({ headless: "new" });
    const page = await browser.newPage();

    // Monitor API/Fetch
    page.on('response', async (response) => {
        const url = response.url();
        const type = response.request().resourceType();
        if (type === 'xhr' || type === 'fetch' || url.includes('api')) {
            console.log(`Intercepted [${type}]: ${url}`);
        }
    });

    try {
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

        console.log('Navigating to VIP Search...');
        await page.goto('https://www.vipleiloes.com.br/pesquisa?OrdenacaoVeiculo=DataInicio', { waitUntil: 'networkidle2', timeout: 60000 });

        console.log('Waiting for content...');
        await new Promise(r => setTimeout(r, 5000));

        // Attempt to find the "Next" button and get its attribute
        const nextBtnInfo = await page.evaluate(() => {
            const btn = document.querySelector('li.page-item.page-go:not(.disabled) a[aria-label="Next"]');
            if (!btn) return 'Button NOT found';
            return {
                href: btn.href,
                dataAjaxUrl: btn.getAttribute('data-ajax-url'),
                outerHTML: btn.outerHTML
            };
        });

        console.log('Next Button Info:', nextBtnInfo);

        const html = await page.content();
        fs.writeFileSync('vip_dump.html', html);
        console.log('HTML dumped to vip_dump.html');

    } catch (e) {
        console.error('Error during inspection:', e.message);
    } finally {
        await browser.close();
    }
})();
