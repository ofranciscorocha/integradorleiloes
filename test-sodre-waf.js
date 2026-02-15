import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
puppeteer.use(StealthPlugin());

(async () => {
    console.log('[Test] Starting Sodré WAF check (ESM)...');
    const browser = await puppeteer.launch({
        headless: true, // Try false if you want to see
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    try {
        const page = await browser.newPage();
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

        console.log('[Test] Navigating to homepage...');
        await page.goto('https://www.sodresantoro.com.br/', { waitUntil: 'domcontentloaded', timeout: 60000 });

        console.log('[Test] Waiting for 5s...');
        await new Promise(r => setTimeout(r, 5000));

        // Start Capturing
        console.log('[Test] Attempting API call...');
        const result = await page.evaluate(async () => {
            try {
                const response = await fetch('https://www.sodresantoro.com.br/api/search-lots', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Accept': 'application/json, text/plain, */*',
                        'Origin': 'https://www.sodresantoro.com.br',
                        'Referer': 'https://www.sodresantoro.com.br/veiculos/lotes?page=1'
                    },
                    body: JSON.stringify({
                        "pageIndex": 1,
                        "pageSize": 24,
                        "ordenacao": "proximos_fechamentos",
                        "tipo_lote": "veiculos",
                        "categoria": "veiculos"
                    })
                });

                if (!response.ok) return { error: `Status ${response.status}`, status: response.status };

                const text = await response.text();
                try {
                    const json = JSON.parse(text);
                    return { success: true, count: json.totalCount || json.count };
                } catch (e) {
                    return { error: 'Invalid JSON', text: text.substring(0, 500) };
                }
            } catch (err) {
                return { error: err.toString() };
            }
        });

        if (result.error) {
            console.error('[Test] FAILED:', result.error);
            if (result.text) console.error('[Test] Response Snippet:', result.text);
        } else {
            console.log('[Test] SUCCESS! Got JSON data.');
            console.log('[Test] Count:', result.count);
        }

    } catch (e) {
        console.error('[Test] Crashed:', e);
    } finally {
        await browser.close();
    }
})();
