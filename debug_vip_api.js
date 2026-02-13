import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';

puppeteer.use(StealthPlugin());

const testVIP = async () => {
    const browser = await puppeteer.launch({ headless: "new" });
    const page = await browser.newPage();
    await page.goto('https://www.vipleiloes.com.br', { waitUntil: 'networkidle2' });

    const tests = [
        { st: 2, sk: 0, tp: 1, bt: "veiculos" },
        { st: 2, sk: 0, tp: 1 },
        { st: 2, sk: 0, bt: "" },
        { st: 2, sk: 0, tp: 1, bt: "" }
    ];

    for (const body of tests) {
        console.log(`Testing with body: ${JSON.stringify(body)}`);
        const result = await page.evaluate(async (b) => {
            const res = await fetch('https://www.vipleiloes.com.br/Pesquisa/GetLotes', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
                body: JSON.stringify(b)
            });
            return await res.json();
        }, body);
        console.log(`Count: ${result?.lotes?.length || 0}`);
    }

    await browser.close();
};

testVIP();
