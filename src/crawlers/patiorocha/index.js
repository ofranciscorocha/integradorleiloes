import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import dotenv from 'dotenv';
import { getExecutablePath, getCommonArgs } from '../../utils/browser.js';

dotenv.config();
puppeteer.use(StealthPlugin());

const TIMEOUT = parseInt(process.env.CRAWLER_TIMEOUT_MS) || 90000;
const SITE = 'patiorochaleiloes.com.br';

const createCrawler = (db) => {
    const { salvarLista } = db;

    const buscarTodos = async () => {
        console.log(`🚀 [${SITE}] Iniciando captura (Resilience Mode)...`);

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

            // Navigation with retry
            let loaded = false;
            for (let i = 0; i < 2; i++) {
                try {
                    await page.goto('https://www.patiorochaleiloes.com.br/lotes/search?tipo=veiculo', {
                        waitUntil: 'networkidle2',
                        timeout: TIMEOUT
                    });
                    await page.waitForSelector('.card', { timeout: 15000 });
                    loaded = true;
                    break;
                } catch (e) {
                    console.log(`   ⚠️ [${SITE}] Retrying main page load (${i + 1}/2)...`);
                    await new Promise(r => setTimeout(r, 3000));
                }
            }

            if (!loaded) throw new Error('Não foi possível carregar a página de busca');

            console.log(`🔍 [${SITE}] Ativando Deep-Scroll...`);
            await autoScroll(page);

            const items = await page.evaluate((site) => {
                const results = [];
                const cards = document.querySelectorAll('.card');

                cards.forEach((card) => {
                    try {
                        const linkEl = card.querySelector('a');
                        const titleEl = card.querySelector('h5, .card-title, h3');
                        if (!linkEl || !titleEl) return;

                        const imgEl = card.querySelector('a.rounded, .img-wrapper, img');
                        let foto = '';
                        if (imgEl) {
                            if (imgEl.tagName === 'IMG') {
                                foto = imgEl.src || imgEl.getAttribute('data-src');
                            } else {
                                const style = imgEl.getAttribute('style') || '';
                                const match = style.match(/url\(['"]?(.*?)['"]?\)/);
                                if (match) foto = match[1];
                            }
                        }

                        const textContent = card.innerText.toUpperCase();
                        let condicao = 'Leilão';
                        if (textContent.includes('SUCATA')) condicao = 'Sucata';
                        else if (textContent.includes('SINISTRO')) condicao = 'Sinistrado';

                        const anoMatch = textContent.match(/ANO\/MODELO:\s*(\d{4})/);
                        const ano = anoMatch ? parseInt(anoMatch[1]) : null;

                        const valueEl = card.querySelector('h4, .price, .valor');
                        const valorText = valueEl ? valueEl.innerText.trim() : '0';
                        const valor = parseFloat(valorText.replace(/[^0-9,]/g, '').replace(',', '.')) || 0;

                        results.push({
                            registro: linkEl.href.split('/').pop().split('?')[0],
                            site: site,
                            link: linkEl.href,
                            veiculo: titleEl.innerText.trim().toUpperCase(),
                            fotos: foto ? [foto] : [],
                            valor: valor,
                            condicao: condicao,
                            ano: ano,
                            localLeilao: 'PR / BR',
                            modalidade: 'leilao',
                            tipo: 'veiculo'
                        });
                    } catch (e) { }
                });
                return results;
            }, SITE);

            if (items.length > 0) {
                await salvarLista(items);
                totalColetado = items.length;
                console.log(`✅ [${SITE}] Capturados ${totalColetado} veículos.`);
            }

        } catch (e) {
            console.error(`❌ [${SITE}] Erro:`, e.message);
        } finally {
            await browser.close();
        }
        return totalColetado;
    };

    async function autoScroll(page) {
        await page.evaluate(async () => {
            await new Promise((resolve) => {
                let totalHeight = 0;
                let distance = 300;
                let count = 0;
                let timer = setInterval(() => {
                    let scrollHeight = document.body.scrollHeight;
                    window.scrollBy(0, distance);
                    totalHeight += distance;
                    count++;
                    if (totalHeight >= scrollHeight || count > 150) {
                        clearInterval(timer);
                        resolve();
                    }
                }, 150);
            });
        });
        await new Promise(r => setTimeout(r, 3000));
    }

    return { buscarTodos, SITE };
};

export default createCrawler;
