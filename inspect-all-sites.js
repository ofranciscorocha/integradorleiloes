import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import fs from 'fs';

puppeteer.use(StealthPlugin());

async function inspectSites() {
    const browser = await puppeteer.launch({
        headless: "new",
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--window-size=1920,1080']
    });

    // ===== 1. COPART =====
    console.log('\n========== COPART ==========');
    try {
        const page = await browser.newPage();
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36');

        console.log('[COPART] Navigating to copart.com.br...');
        await page.goto('https://www.copart.com.br', { waitUntil: 'networkidle2', timeout: 60000 }).catch(e => console.log('Timeout, continuing...'));

        await new Promise(r => setTimeout(r, 10000));

        const copartUrl = page.url();
        const copartTitle = await page.title();
        const copartHtml = await page.content();

        console.log(`[COPART] Final URL: ${copartUrl}`);
        console.log(`[COPART] Title: ${copartTitle}`);
        console.log(`[COPART] HTML length: ${copartHtml.length}`);
        console.log(`[COPART] Has Incapsula: ${copartHtml.includes('Incapsula')}`);
        console.log(`[COPART] Has recaptcha: ${copartHtml.includes('recaptcha')}`);
        console.log(`[COPART] Has ng-app: ${copartHtml.includes('ng-app')}`);

        // Check cookies
        const cookies = await page.cookies();
        console.log(`[COPART] Cookies: ${cookies.map(c => c.name).join(', ')}`);

        // Try to find any vehicle-related content
        const hasSearchResults = copartHtml.includes('lot-search') || copartHtml.includes('vehicle') || copartHtml.includes('veiculo');
        console.log(`[COPART] Has search/vehicle content: ${hasSearchResults}`);

        // Save HTML for analysis
        fs.writeFileSync('debug-copart-html.html', copartHtml.substring(0, 5000));
        console.log('[COPART] Saved first 5000 chars to debug-copart-html.html');

        // Try the search results page  
        console.log('[COPART] Trying lotSearchResults...');
        await page.goto('https://www.copart.com.br/lotSearchResults/?free=true&query=%2A', { waitUntil: 'networkidle2', timeout: 30000 }).catch(() => { });
        await new Promise(r => setTimeout(r, 5000));

        const searchUrl = page.url();
        const searchHtml = await page.content();
        console.log(`[COPART] Search URL: ${searchUrl}`);
        console.log(`[COPART] Search HTML length: ${searchHtml.length}`);
        console.log(`[COPART] Has lot cards: ${searchHtml.includes('lot-row') || searchHtml.includes('lot-card') || searchHtml.includes('copart-table')}`);

        fs.writeFileSync('debug-copart-search.html', searchHtml.substring(0, 10000));

        await page.close();
    } catch (e) {
        console.log(`[COPART] Error: ${e.message}`);
    }

    // ===== 2. FREITAS =====
    console.log('\n========== FREITAS ==========');
    try {
        const page = await browser.newPage();
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');

        console.log('[FREITAS] Navigating...');
        await page.goto('https://www.freitasleiloeiro.com.br/Leiloes/PesquisarLotes?Categoria=1', { waitUntil: 'networkidle2', timeout: 60000 });

        await new Promise(r => setTimeout(r, 3000));

        // Inspect card structure
        const cardInfo = await page.evaluate(() => {
            const cards = document.querySelectorAll('.cardlote, .cardLote, .card-lote');
            const info = { count: cards.length, samples: [] };

            Array.from(cards).slice(0, 3).forEach(card => {
                const sample = {
                    outerHTML: card.outerHTML.substring(0, 2000),
                    classes: card.className,
                    imgs: [],
                    divBgs: []
                };

                // Check all img elements
                card.querySelectorAll('img').forEach(img => {
                    sample.imgs.push({
                        src: img.getAttribute('src') || '',
                        dataSrc: img.getAttribute('data-src') || '',
                        dataLazy: img.getAttribute('data-lazy') || '',
                        class: img.className,
                        tag: img.tagName
                    });
                });

                // Check divs with background-image
                card.querySelectorAll('*').forEach(el => {
                    const style = el.getAttribute('style') || '';
                    if (style.includes('background')) {
                        sample.divBgs.push({
                            tag: el.tagName,
                            class: el.className,
                            style: style.substring(0, 200)
                        });
                    }
                });

                info.samples.push(sample);
            });

            return info;
        });

        console.log(`[FREITAS] Cards found: ${cardInfo.count}`);
        if (cardInfo.samples.length > 0) {
            const s = cardInfo.samples[0];
            console.log(`[FREITAS] Card class: ${s.classes}`);
            console.log(`[FREITAS] Images in card: ${s.imgs.length}`);
            s.imgs.forEach((img, i) => {
                console.log(`  img[${i}]: src="${img.src?.substring(0, 100)}" data-src="${img.dataSrc?.substring(0, 100)}" class="${img.class}"`);
            });
            console.log(`[FREITAS] Divs with bg: ${s.divBgs.length}`);
            s.divBgs.forEach((d, i) => {
                console.log(`  div[${i}]: ${d.tag}.${d.class} style="${d.style}"`);
            });
        }

        // Save full card HTML
        if (cardInfo.samples.length > 0) {
            fs.writeFileSync('debug-freitas-card.html', cardInfo.samples[0].outerHTML);
        }

        await page.close();
    } catch (e) {
        console.log(`[FREITAS] Error: ${e.message}`);
    }

    // ===== 3. MGL =====
    console.log('\n========== MGL ==========');
    try {
        const page = await browser.newPage();
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');

        console.log('[MGL] Navigating to /leiloes...');
        await page.goto('https://www.mgl.com.br/leiloes', { waitUntil: 'networkidle2', timeout: 60000 });
        await new Promise(r => setTimeout(r, 3000));

        const mglUrl = page.url();
        const mglTitle = await page.title();
        console.log(`[MGL] URL: ${mglUrl}, Title: ${mglTitle}`);

        // Check what's on the page
        const mglInfo = await page.evaluate(() => {
            const allLinks = Array.from(document.querySelectorAll('a')).filter(a => {
                const href = a.getAttribute('href') || '';
                return href.includes('leilao') || href.includes('lote') || href.includes('veiculo');
            }).map(a => ({ href: a.getAttribute('href'), text: a.textContent.trim().substring(0, 80) }));

            const cards = document.querySelectorAll('.dg-leilao-item-card, .card, .lote-item');

            return {
                linkCount: allLinks.length,
                links: allLinks.slice(0, 10),
                cardCount: cards.length,
                bodyText: document.body.innerText.substring(0, 2000)
            };
        });

        console.log(`[MGL] Links found: ${mglInfo.linkCount}`);
        mglInfo.links.forEach(l => console.log(`  ${l.href} => ${l.text}`));
        console.log(`[MGL] Cards found: ${mglInfo.cardCount}`);
        console.log(`[MGL] Body text preview: ${mglInfo.bodyText.substring(0, 500)}`);

        // Try clicking on an auction
        if (mglInfo.links.length > 0) {
            const firstLink = mglInfo.links[0].href;
            const fullUrl = firstLink.startsWith('http') ? firstLink : `https://www.mgl.com.br${firstLink}`;
            console.log(`[MGL] Navigating to first link: ${fullUrl}`);
            await page.goto(fullUrl, { waitUntil: 'networkidle2', timeout: 30000 }).catch(() => { });
            await new Promise(r => setTimeout(r, 3000));

            const lotInfo = await page.evaluate(() => {
                const cards = document.querySelectorAll('.dg-leilao-item-card, .card, .lote-item, [class*="lote"], [class*="card"]');
                const first = cards[0];
                return {
                    url: window.location.href,
                    cardCount: cards.length,
                    cardHtml: first ? first.outerHTML.substring(0, 2000) : 'NO CARDS',
                    bodyText: document.body.innerText.substring(0, 1000)
                };
            });

            console.log(`[MGL] Auction page URL: ${lotInfo.url}`);
            console.log(`[MGL] Lot cards: ${lotInfo.cardCount}`);
            if (lotInfo.cardHtml !== 'NO CARDS') {
                fs.writeFileSync('debug-mgl-card.html', lotInfo.cardHtml);
                console.log(`[MGL] Saved card HTML to debug-mgl-card.html`);
            }
        }

        await page.close();
    } catch (e) {
        console.log(`[MGL] Error: ${e.message}`);
    }

    // ===== 4. PESTANA =====
    console.log('\n========== PESTANA ==========');
    try {
        const page = await browser.newPage();
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');

        // Intercept API responses
        const apiData = [];
        page.on('response', async response => {
            const url = response.url();
            if (url.includes('pestanaleiloes') && response.status() === 200) {
                try {
                    const ct = response.headers()['content-type'] || '';
                    if (ct.includes('json')) {
                        const json = await response.json();
                        apiData.push({ url, data: json });
                    }
                } catch (e) { }
            }
        });

        console.log('[PESTANA] Navigating...');
        await page.goto('https://www.pestanaleiloes.com.br', { waitUntil: 'networkidle2', timeout: 60000 });
        await new Promise(r => setTimeout(r, 5000));

        console.log(`[PESTANA] API responses captured: ${apiData.length}`);
        apiData.forEach(a => {
            const dataStr = JSON.stringify(a.data).substring(0, 200);
            console.log(`  ${a.url.substring(0, 100)}: ${dataStr}`);
        });

        // Check links
        const pestanaInfo = await page.evaluate(() => {
            const links = Array.from(document.querySelectorAll('a')).filter(a => {
                const href = a.getAttribute('href') || '';
                return href.includes('leilao') || href.includes('lote') || href.includes('agenda');
            }).map(a => ({ href: a.getAttribute('href'), text: a.textContent.trim().substring(0, 80) }));
            return { links: links.slice(0, 10), title: document.title, bodyText: document.body.innerText.substring(0, 500) };
        });

        console.log(`[PESTANA] Title: ${pestanaInfo.title}`);
        console.log(`[PESTANA] Links: ${pestanaInfo.links.length}`);
        pestanaInfo.links.forEach(l => console.log(`  ${l.href} => ${l.text}`));

        // Save API data
        if (apiData.length > 0) {
            fs.writeFileSync('debug-pestana-api.json', JSON.stringify(apiData, null, 2));
            console.log('[PESTANA] Saved API data to debug-pestana-api.json');
        }

        await page.close();
    } catch (e) {
        console.log(`[PESTANA] Error: ${e.message}`);
    }

    // ===== 5. VIP =====
    console.log('\n========== VIP ==========');
    try {
        const page = await browser.newPage();
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');

        console.log('[VIP] Navigating...');
        await page.goto('https://www.vipleiloes.com.br/pesquisa?Categorias=3', { waitUntil: 'networkidle2', timeout: 60000 });
        await new Promise(r => setTimeout(r, 3000));

        const vipInfo = await page.evaluate(() => {
            const cards = document.querySelectorAll('div.itm-card');
            const first = cards[0];
            return {
                url: window.location.href,
                title: document.title,
                cardCount: cards.length,
                cardHtml: first ? first.outerHTML.substring(0, 2000) : 'NO CARDS',
                totalText: document.querySelector('.tituloListagem h4')?.innerText || '',
                bodyText: document.body.innerText.substring(0, 500)
            };
        });

        console.log(`[VIP] URL: ${vipInfo.url}`);
        console.log(`[VIP] Title: ${vipInfo.title}`);
        console.log(`[VIP] Cards: ${vipInfo.cardCount}`);
        console.log(`[VIP] Total text: ${vipInfo.totalText}`);

        if (vipInfo.cardHtml !== 'NO CARDS') {
            fs.writeFileSync('debug-vip-card.html', vipInfo.cardHtml);
            console.log('[VIP] Saved card HTML to debug-vip-card.html');
        }

        await page.close();
    } catch (e) {
        console.log(`[VIP] Error: ${e.message}`);
    }

    await browser.close();
    console.log('\n========== DONE ==========');
}

inspectSites().catch(console.error);
