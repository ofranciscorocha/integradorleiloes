import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import dotenv from 'dotenv';
import { getExecutablePath, getCommonArgs, getRandomUserAgent } from '../../utils/browser.js';

dotenv.config();
puppeteer.use(StealthPlugin());

const TIMEOUT = parseInt(process.env.CRAWLER_TIMEOUT_MS) || 90000;
const SITE = 'joaoemilio.com.br';
const BASE_URL = 'https://www.joaoemilio.com.br';

const createCrawler = (db) => {
    const { salvarLista } = db;

    const buscarTodos = async () => {
        console.log(`🚀 [${SITE}] Iniciando captura de veículos (João Emílio)...`);

        const browser = await puppeteer.launch({
            executablePath: getExecutablePath(),
            headless: true,
            protocolTimeout: 300000,
            args: getCommonArgs()
        });

        let totalColetado = 0;

        try {
            const page = await browser.newPage();
            await page.setUserAgent(getRandomUserAgent());

            // 1. Get Active Auctions
            console.log(`   🔍 [${SITE}] Acessando home para listar leilões...`);
            await page.goto(BASE_URL, { waitUntil: 'networkidle2', timeout: TIMEOUT });
            await new Promise(r => setTimeout(r, 4000));

            // Scrape auctions
            const leiloes = await page.evaluate((baseUrl) => {
                const found = [];
                // Typical João Emílio selectors (target cards in home)
                document.querySelectorAll('a[href*="/leilao/"], .card-leilao, .leilao-item').forEach(el => {
                    const link = el.href || el.querySelector('a')?.href;
                    if (link && !found.find(f => f.url === link)) {
                        found.push({
                            url: link,
                            titulo: el.innerText.split('\n')[0].trim() || 'Leilão'
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
                            // Selectors based on verified HTML
                            const titleEl = card.querySelector('h5, .titulo, .descricao');
                            const descEl = card.querySelector('div[style*="text-align: justify"], .desc-lote');
                            const linkEl = card.querySelector('a[href*="/item/"]');
                            const priceEl = card.querySelector('.maior-lance h4, .valor, .preco');

                            // Image can be an IMG tag or a background-image on an element
                            let imgSrc = '';
                            const valImg = card.querySelector('img');
                            if (valImg) {
                                imgSrc = valImg.src || valImg.getAttribute('data-src') || valImg.getAttribute('data-original');
                            }

                            if (!imgSrc || imgSrc.includes('transparent.gif')) {
                                const bgEl = card.querySelector('a.rounded[style*="background"], div[style*="background-image"], .img-wrapper[style*="background-image"]');
                                if (bgEl) {
                                    const style = bgEl.getAttribute('style') || '';
                                    const match = style.match(/url\(['"]?(.*?)['"]?\)/);
                                    if (match) imgSrc = match[1];
                                }
                            }

                            // Clean image URL
                            if (imgSrc && imgSrc.startsWith('//')) imgSrc = 'https:' + imgSrc;
                            if (imgSrc && imgSrc.startsWith('/')) imgSrc = baseUrl + imgSrc;

                            if (linkEl && (titleEl || descEl)) {
                                let title = titleEl ? titleEl.innerText.trim() : '';
                                const description = descEl ? descEl.innerText.trim() : '';

                                // Improve title if it's generic like "MATERIAIS" but there's a description
                                if ((!title || title.length < 5 || title === 'MATERIAIS' || title === 'VEÍCULOS') && description) {
                                    title = description.split('\n')[0].substring(0, 100);
                                }

                                // Basic cleanup
                                title = title.replace(/\s+/g, ' ').trim();

                                if (!/veiculo|carro|moto|caminhao|utilitario/i.test(title) &&
                                    !/veiculo|carro|moto|caminhao|utilitario/i.test(description) &&
                                    !document.title.match(/veiculo|carro|moto/i)) {
                                    // Skip if absolutely no mention of vehicles
                                    // But be careful, sometimes specific models are mentioned without "veiculo" keyword
                                    // filtering is better done later or via specific model regex
                                }

                                const url = linkEl.href;
                                const valorText = priceEl ? priceEl.innerText.replace(/[^0-9,]/g, '').replace(',', '.') : '0';

                                batch.push({
                                    site: site,
                                    registro: url.split('/item/')[1]?.split('/')[0] || url.split('/').pop(),
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
