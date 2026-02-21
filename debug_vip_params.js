
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

    // Check if it returned a full page or just a fragment (or JSON)
    const checkContent = async (label) => {
        const content = await page.content();
        const hasCards = content.includes('card-anuncio');
        console.log(`[${label}] Has cards: ${hasCards}`);

        if (hasCards) {
            try {
                const item = await page.$eval('.card-anuncio .anc-title h1', el => el.textContent.trim());
                console.log(`[${label}] First Item: ${item}`);
                return item;
            } catch (e) {
                console.log(`[${label}] Error extracting item: ${e.message}`);
                return null;
            }
        } else {
            console.log(`[${label}] Content Preview: ${content.substring(0, 100).replace(/\n/g, ' ')}`);
            return null;
        }
    };

    const handlerUrl = 'https://www.vipleiloes.com.br/pesquisa?SortOrder=DataInicio&pageNumber=2&handler=pesquisar';
    console.log(`Testing handler URL with AJAX header: ${handlerUrl}`);
    await page.setExtraHTTPHeaders({ 'X-Requested-With': 'XMLHttpRequest' });
    await page.goto(handlerUrl, { waitUntil: 'networkidle2' });
    const itemHandler = await checkContent('HandlerURL_AJAX');

    // Reset headers
    await page.setExtraHTTPHeaders({});

    const sortOrderUrl = 'https://www.vipleiloes.com.br/pesquisa?SortOrder=DataInicio&pageNumber=2';
    console.log(`Testing SortOrder URL: ${sortOrderUrl}`);
    await page.goto(sortOrderUrl, { waitUntil: 'networkidle2' });
    const itemSort = await checkContent('SortOrderURL');

    await browser.close();
})();
