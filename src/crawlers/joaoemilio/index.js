import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import dotenv from 'dotenv';
import { getExecutablePath, getCommonArgs } from '../../utils/browser.js';

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
                        // Target lot cards (João Emílio often uses .lote-card or similar)
                        document.querySelectorAll('.lote-card, .card-lote, .item-lote').forEach(card => {
                            const titleEl = card.querySelector('h3, h4, .titulo, .descricao');
                            const linkEl = card.querySelector('a');
                            const priceEl = card.querySelector('.valor, .preco, .lance');
                            const imgEl = card.querySelector('img');

                            if (linkEl && titleEl) {
                                const title = titleEl.innerText.trim();
                                if (!/veiculo|carro|moto|caminhao|utilitario/i.test(title) && !document.body.innerText.includes('veiculo')) {
                                    // Skip if no vehicle keyword found in lot or page context nearby
                                }

                                const url = linkEl.href;
                                const valorText = priceEl ? priceEl.innerText.replace(/[^0-9,]/g, '').replace(',', '.') : '0';

                                batch.push({
                                    site: site,
                                    registro: url.split('/').pop(),
                                    link: url,
                                    veiculo: title.toUpperCase(),
                                    valor: parseFloat(valorText) || 0,
                                    fotos: imgEl ? [imgEl.src] : [],
                                    modalidade: 'leilao',
                                    tipo: 'veiculo'
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
