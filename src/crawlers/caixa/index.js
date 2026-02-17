import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import { getExecutablePath, getCommonArgs } from '../../utils/browser.js';

puppeteer.use(StealthPlugin());

const SITE = 'caixaimoveis';
const BASE_URL = 'https://venda-imoveis.caixa.gov.br/sistema/busca-imovel.asp';

const CIDADES_PRINCIPAIS = [
    { estado: 'SP', cidade: 'Sao Paulo' },
    { estado: 'SP', cidade: 'Campinas' },
    { estado: 'SP', cidade: 'Guarulhos' },
    { estado: 'SP', cidade: 'Santo Andre' },
    { estado: 'SP', cidade: 'Sao Bernardo do Campo' },
    { estado: 'SP', cidade: 'Osasco' },
    { estado: 'SP', cidade: 'Sorocaba' },
    { estado: 'SP', cidade: 'Ribeirao Preto' },
    { estado: 'RJ', cidade: 'Rio de Janeiro' },
    { estado: 'MG', cidade: 'Belo Horizonte' }
];

const createCrawler = (db) => {
    const { salvarLista } = db;

    const buscarTodos = async () => {
        let browser = null;
        try {
            console.log(`🚀 [${SITE}] Iniciando crawler Caixa Imóveis (Stealth Mode)...`);

            browser = await puppeteer.launch({
                headless: true,
                executablePath: getExecutablePath(),
                args: getCommonArgs()
            });

            for (const { estado, cidade } of CIDADES_PRINCIPAIS) {
                let page = null;
                try {
                    console.log(`🔍 [${SITE}] Buscando em ${cidade} - ${estado}...`);

                    // Create new page for each city to ensure clean state
                    page = await browser.newPage();
                    await page.setViewport({ width: 1280, height: 800 });

                    // Navigation
                    await page.goto(BASE_URL, { waitUntil: 'networkidle2', timeout: 60000 });

                    // Select State
                    await page.waitForSelector('#cmb_estado', { timeout: 30000 });
                    await page.select('#cmb_estado', estado);

                    // Allow time for city dropdown to populate via AJAX
                    await new Promise(r => setTimeout(r, 2000));

                    // Finding City Value
                    const cityValue = await page.evaluate((cidadeName) => {
                        const options = Array.from(document.querySelectorAll('#cmb_cidade option'));
                        const option = options.find(o => o.text.toUpperCase().includes(cidadeName.toUpperCase()));
                        return option ? option.value : null;
                    }, cidade);

                    if (cityValue) {
                        await page.select('#cmb_cidade', cityValue);
                        await new Promise(r => setTimeout(r, 2000));

                        // 1. Select Neighborhoods (if available)
                        const bairroSelector = '#listabairros input';
                        try {
                            // Sometimes neighborhoods don't load or aren't required, short timeout
                            await page.waitForSelector(bairroSelector, { timeout: 5000 });
                            await page.evaluate(() => {
                                const checks = document.querySelectorAll('#listabairros input');
                                checks.forEach(c => c.checked = true);
                            });
                            // console.log(`      ✓ [${SITE}] Bairros analisados.`);
                        } catch (e) {
                            // console.log(`      ⚠️ [${SITE}] Seleção de bairros pulada.`);
                        }

                        // 2. Next Step
                        try {
                            const nextBtn = await page.$('#btn_next0');
                            if (nextBtn) {
                                await Promise.all([
                                    page.click('#btn_next0'),
                                    new Promise(r => setTimeout(r, 3000))
                                ]);
                            }
                        } catch (e) { console.log(`      ⚠️ Erro ao clicar next0: ${e.message}`); }

                        try {
                            const filterSel = await page.$('#cmb_tp_imovel');
                            if (filterSel) {
                                await page.evaluate(() => {
                                    const proc = (id) => {
                                        const el = document.getElementById(id);
                                        if (el) {
                                            // Try to find an option that looks like 'Indiferente' or value '0'
                                            // Based on debug HTML: values are 1,2,3,4(Indiferente) for type?
                                            // Value 0 is Indiferente for others?
                                            // Let's safe bet: last option? Or text 'Indiferente'
                                            const options = Array.from(el.options);
                                            const opt = options.find(o => o.text.includes('Indiferente')) || options[options.length - 1];
                                            if (opt) el.value = opt.value;
                                        }
                                    };
                                    ['cmb_tp_imovel', 'cmb_quartos', 'cmb_vg_garagem', 'cmb_area_util', 'cmb_faixa_vlr'].forEach(proc);
                                });
                                await Promise.all([
                                    page.click('#btn_next1'),
                                    new Promise(r => setTimeout(r, 3000))
                                ]);
                            }
                        } catch (e) {
                            // Already at results?
                        }

                        // 4. Results
                        try {
                            await page.waitForSelector('.group-block-item', { timeout: 10000 });
                        } catch (e) {
                            console.log(`      🔸 [${SITE}] Sem resultados finais em ${cidade}.`);
                        }

                        // Extract items
                        const items = await page.evaluate(() => {
                            const results = [];
                            const cards = document.querySelectorAll('.group-block-item');

                            cards.forEach(card => {
                                try {
                                    const linkEl = card.querySelector('a');
                                    const relativeLink = linkEl ? linkEl.getAttribute('href') : '';
                                    const link = relativeLink ? `https://venda-imoveis.caixa.gov.br/sistema/${relativeLink}` : '';

                                    const infoSpans = card.querySelectorAll('.dadosimovel-col2 span');
                                    let bairro = '';
                                    let valor = '0';
                                    let detalhes = '';
                                    let endereco = '';

                                    if (infoSpans.length >= 3) {
                                        bairro = infoSpans[0].innerText.trim();
                                        valor = infoSpans[1].innerText.trim();

                                        const fontEl = infoSpans[2].querySelector('font');
                                        if (fontEl) {
                                            const parts = fontEl.innerHTML.split('<br>');
                                            detalhes = parts[0] ? parts[0].replace(/<[^>]*>/g, '').trim() : '';
                                            endereco = parts[1] ? parts[1].replace(/<[^>]*>/g, '').trim() : '';
                                        }
                                    }

                                    // Fix link if it's JS function or partial
                                    if (link && link.includes('detalhe-imovel.asp')) {
                                        results.push({
                                            link,
                                            bairro,
                                            valor,
                                            detalhes,
                                            endereco,
                                        });
                                    }
                                } catch (e) { }
                            });
                            return results;
                        });

                        if (items.length > 0) {
                            console.log(`      ✅ [${SITE}] ${cidade}: +${items.length} imóveis.`);

                            const batch = items.map(item => {
                                const regMatch = item.link.match(/hdnimovel=(\d+)/);
                                const registro = regMatch ? regMatch[1] : Date.now().toString();

                                return {
                                    site: SITE,
                                    registro,
                                    link: item.link,
                                    veiculo: `${item.detalhes || 'IMÓVEL CAIXA'} - ${item.bairro}`,
                                    valor: parseFloat(item.valor.replace(/[^0-9,]/g, '').replace(',', '.')) || 0,
                                    ano: null,
                                    localLeilao: `${item.endereco}, ${cidade} - ${estado}`,
                                    modalidade: 'venda',
                                    tipo: 'imovel',
                                    descricao: item.detalhes,
                                    fotos: []
                                };
                            });

                            await salvarLista(batch);
                        } else {
                            // console.log(`      🔸 [${SITE}] ${cidade}: 0 imóveis.`);
                        }

                    } else {
                        console.log(`   ⚠️ [${SITE}] Cidade ${cidade} não encontrada.`);
                    }

                } catch (err) {
                    console.error(`   ❌ Erro em ${cidade}: ${err.message}`);
                } finally {
                    if (page) await page.close();
                }
            }

        } catch (error) {
            console.error(`❌ [${SITE}] Fatal Error:`, error.message);
        } finally {
            if (browser) await browser.close();
        }
    };

    return { buscarTodos, SITE };
};

export default createCrawler;
