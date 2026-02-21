import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import dotenv from 'dotenv';
import { getExecutablePath, getCommonArgs } from '../../utils/browser.js';

dotenv.config();
puppeteer.use(StealthPlugin());

const TIMEOUT = parseInt(process.env.CRAWLER_TIMEOUT_MS) || 90000;
const SITE = 'danielgarcialeiloes.com.br';
const BASE_URL = 'https://www.danielgarcialeiloes.com.br';

const createCrawler = (db) => {
    const { salvarLista } = db;

    const buscarTodos = async () => {
        console.log(`🚀 [${SITE}] Iniciando captura (System: Soleon)...`);

        const browser = await puppeteer.launch({
            executablePath: getExecutablePath(),
            headless: true,
            protocolTimeout: 240000,
            args: getCommonArgs()
        });

        let totalColetado = 0;

        try {
            const page = await browser.newPage();
            await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36');

            // 1. Get Active Auctions
            console.log(`   🔍 [${SITE}] Acessando home para listar leilões...`);
            await page.goto(BASE_URL, { waitUntil: 'networkidle2', timeout: TIMEOUT });
            await new Promise(r => setTimeout(r, 4000));

            // Scrape auctions
            const leiloes = await page.evaluate((baseUrl) => {
                const found = [];
                // Soleon pattern for auction links
                document.querySelectorAll('a[href*="/leilao/"], .card-leilao, .leilao-item, .card').forEach(el => {
                    const link = el.href || el.querySelector('a')?.href;
                    if (link && link.includes('/leilao/') && !found.find(f => f.url === link)) {
                        let title = el.innerText.split('\n')[0].trim();
                        found.push({
                            url: link,
                            titulo: title || 'Leilão'
                        });
                    }
                });
                return found;
            }, BASE_URL);

            console.log(`   📊 [${SITE}] Encontrados ${leiloes.length} leilões potenciais.`);

            for (const leilao of leiloes) {
                console.log(`   🔄 [${SITE}] Processando: ${leilao.titulo}`);
                try {
                    await page.goto(leilao.url, { waitUntil: 'networkidle2', timeout: TIMEOUT });
                    await new Promise(r => setTimeout(r, 2000));

                    // Extract lots from auction page
                    const itens = await page.evaluate((site, baseUrl) => {
                        const batch = [];
                        // Target lot cards
                        const requestCards = document.querySelectorAll('.lote, .lote-card, .card-lote, .item-lote');

                        requestCards.forEach(card => {
                            const titleEl = card.querySelector('h5, .titulo, .descricao');
                            const descEl = card.querySelector('div[style*="text-align: justify"], .desc-lote');
                            const linkEl = card.querySelector('a[href*="/item/"], a[href*="/lote/"]');
                            const priceEl = card.querySelector('.maior-lance h4, .valor, .preco, .price');

                            let imgSrc = '';
                            const valImg = card.querySelector('img');
                            if (valImg) {
                                imgSrc = valImg.src || valImg.getAttribute('data-src');
                            } else {
                                const bgEl = card.querySelector('a.rounded[style*="background"], div[style*="background-image"]');
                                if (bgEl) {
                                    const style = bgEl.getAttribute('style');
                                    const match = style.match(/url\(['"]?(.*?)['"]?\)/);
                                    if (match) imgSrc = match[1];
                                }
                            }

                            if (linkEl && (titleEl || descEl)) {
                                let title = titleEl ? titleEl.innerText.trim() : '';
                                const description = descEl ? descEl.innerText.trim() : '';

                                if ((!title || title.length < 5 || title.includes('VEÍCULOS')) && description) {
                                    title = description.split('\n')[0].substring(0, 100);
                                }

                                title = title.replace(/\s+/g, ' ').trim();

                                if (!title) return;

                                const url = linkEl.href;
                                const valorText = priceEl ? priceEl.innerText.replace(/[^0-9,]/g, '').replace(',', '.') : '0';

                                batch.push({
                                    site: site,
                                    registro: url.split('/').pop().split('?')[0],
                                    link: url,
                                    veiculo: title.toUpperCase(),
                                    valor: parseFloat(valorText) || 0,
                                    fotos: imgSrc ? [imgSrc] : [],
                                    modalidade: 'leilao',
                                    tipo: 'veiculo',
                                    descricao: description
                                });
                            }
                        });
                        return batch;
                    }, SITE, BASE_URL);

                    if (itens.length > 0) {
                        await salvarLista(itens);
                        totalColetado += itens.length;
                        console.log(`      ✅ [${SITE}] +${itens.length} veículos coletados.`);
                    }
                } catch (err) {
                    console.log(`      ⚠️ [${SITE}] Erro no leilão: ${err.message}`);
                }
            }

        } catch (e) {
            console.error(`❌ [${SITE}] Erro Fatal:`, e.message);
        } finally {
            await browser.close();
        }

        console.log(`✅ [${SITE}] Finalizado! Coleta total: ${totalColetado}`);
        return totalColetado;
    };

    return { buscarTodos, SITE };
};

export default createCrawler;
