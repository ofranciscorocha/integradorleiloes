import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import dotenv from 'dotenv';

dotenv.config();
puppeteer.use(StealthPlugin());

const TIMEOUT = parseInt(process.env.CRAWLER_TIMEOUT_MS) || 60000;

const createCrawler = (db) => {
    const { salvarLista } = db;
    const SITE = 'vipleiloes.com.br';
    const BASE_URL = 'https://www.vipleiloes.com.br';

    const parseCardText = (text) => {
        const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
        const result = {
            veiculo: '',
            ano: null,
            valor: 0,
            local: '',
            previsao: ''
        };

        try {
            // Line 1: Header (LANCE, etc)
            // Line 2: Model (ONIX PLUS 1.0 TURBO - 2020/2021)
            const modelLine = lines[1] || '';
            const yearMatch = modelLine.match(/(\d{4})\/(\d{4})/);
            result.ano = yearMatch ? parseInt(yearMatch[2]) : null;
            result.veiculo = modelLine.split('-')[0].trim();

            // Find price
            const priceLine = lines.find(l => l.includes('R$'));
            if (priceLine) {
                result.valor = parseFloat(priceLine.replace(/[^0-9,]/g, '').replace(',', '.')) || 0;
            }

            // Find location
            const localLine = lines.find(l => l.includes('Local:'));
            if (localLine) {
                result.local = localLine.split('Local:')[1].trim();
            }
        } catch (e) { }

        return result;
    };

    const buscarTodasPaginas = async () => {
        console.log(`🚀 [${SITE}] HIGH-YIELD: Iniciando coleta profunda...`);

        const browser = await puppeteer.launch({
            headless: "new",
            args: ['--no-sandbox', '--disable-setuid-sandbox']
        });

        const listaTotal = [];
        try {
            const page = await browser.newPage();
            await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36');

            // Navigate to main listing
            await page.goto(`${BASE_URL}/leilao/todos`, { waitUntil: 'networkidle2', timeout: TIMEOUT }).catch(() => {
                return page.goto(BASE_URL, { waitUntil: 'networkidle2', timeout: TIMEOUT });
            });

            console.log(`🔍 [${SITE}] Descobrindo lotes...`);

            // Aggressive scroll for infinite loading
            await autoScroll(page);

            const cards = await page.evaluate((site) => {
                const results = [];
                document.querySelectorAll('.card-anuncio').forEach(card => {
                    const linkEl = card.querySelector('a');
                    const imgEl = card.querySelector('img');
                    if (!linkEl) return;

                    results.push({
                        site,
                        link: linkEl.href,
                        fotos: imgEl ? [imgEl.src] : [],
                        text: card.innerText,
                        registro: linkEl.href.split('/').pop().match(/\d+/)?.[0] || Math.random().toString(36).substr(2, 5)
                    });
                });
                return results;
            }, SITE);

            console.log(`📦 [${SITE}] Total de ${cards.length} veículos detectados.`);

            for (const card of cards) {
                const p = parseCardText(card.text);
                if (!p.veiculo) continue;

                // Fuzzy filter: Keep everything that isn't furniture/electronics
                const text = (p.veiculo + ' ' + card.text).toUpperCase();
                const blacklist = ['MOVEIS', 'ELETRO', 'INFORMÁTICA', 'CELULAR', 'CADEIRA', 'MESA'];
                if (blacklist.some(b => text.includes(b)) && !p.ano) continue;

                listaTotal.push({
                    registro: card.registro,
                    site: SITE,
                    link: card.link,
                    veiculo: p.veiculo,
                    ano: p.ano,
                    fotos: card.fotos,
                    valor: p.valor,
                    valorInicial: p.valor,
                    descricao: `${p.veiculo} - ${p.ano || ''} - ${p.local}`,
                    localLeilao: p.local,
                    previsao: { string: '' },
                    modalidade: 'leilao',
                    tipo: 'veiculo'
                });
            }

            if (listaTotal.length > 0) {
                await salvarLista(listaTotal);
            }
            console.log(`✅ [${SITE}] Salvos ${listaTotal.length} veículos.`);

        } catch (error) {
            console.error(`❌ [${SITE}] Erro:`, error.message);
        } finally {
            await browser.close();
        }
        return listaTotal.length;
    };

    return { buscarTodasPaginas, SITE };
};

async function autoScroll(page) {
    await page.evaluate(async () => {
        await new Promise((resolve) => {
            let totalHeight = 0;
            let distance = 400;
            let timer = setInterval(() => {
                let scrollHeight = document.body.scrollHeight;
                window.scrollBy(0, distance);
                totalHeight += distance;
                if (totalHeight >= scrollHeight || totalHeight > 10000) { // Limit to 10k pixels or end
                    clearInterval(timer);
                    resolve();
                }
            }, 100);
        });
    });
}

export default createCrawler;
