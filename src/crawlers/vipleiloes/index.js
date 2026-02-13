import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import dotenv from 'dotenv';

dotenv.config();
puppeteer.use(StealthPlugin());

const TIMEOUT = parseInt(process.env.CRAWLER_TIMEOUT_MS) || 45000;

const createCrawler = (db) => {
    const { salvarLista } = db;
    const SITE = 'vipleiloes.com.br';
    const BASE_URL = 'https://www.vipleiloes.com.br';

    const parseCardText = (text) => {
        // Card text format:
        // "ABERTO PARA LANCES\nFPACE 380CV V6 S - 2017/2018\nJaguar\n59.580 Km\nPlaca Final 2\nValor Atual\nR$ 99.000,00\nValor inicial:\nR$ 99.000,00\nLote: 3  Local: GO\n1 Lance\nInício: 13/02/2026\n10:00\nVer mais"
        const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
        const result = {
            veiculo: '',
            marca: '',
            km: 0,
            ano: null,
            valor: 0,
            valorInicial: 0,
            localLeilao: '',
            lote: '',
            previsao: ''
        };

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];

            // Line 2 is usually the vehicle model + year (e.g. "FPAGE 380CV V6 S - 2017/2018")
            if (i === 1) {
                const yearMatch = line.match(/(\d{4})\/(\d{4})/);
                if (yearMatch) {
                    result.ano = parseInt(yearMatch[2]);
                    result.veiculo = line.replace(/\s*-\s*\d{4}\/\d{4}/, '').trim();
                } else {
                    result.veiculo = line;
                }
            }

            // Line 3 is usually the brand (e.g. "Jaguar")
            if (i === 2 && !line.includes('Km') && !line.includes('R$')) {
                result.marca = line;
                result.veiculo = `${result.marca} ${result.veiculo}`;
            }

            // KM line (e.g. "59.580 Km")
            if (line.match(/[\d.]+\s*Km/i)) {
                result.km = parseInt(line.replace(/[^\d]/g, '')) || 0;
            }

            // Valor Atual value (line after "Valor Atual")
            if (line === 'Valor Atual' && i + 1 < lines.length) {
                result.valor = parseFloat(lines[i + 1].replace(/[^0-9,]/g, '').replace(',', '.')) || 0;
            }

            // Valor inicial
            if (line.startsWith('Valor inicial') && i + 1 < lines.length) {
                result.valorInicial = parseFloat(lines[i + 1].replace(/[^0-9,]/g, '').replace(',', '.')) || 0;
            }

            // Lote and Location (e.g. "Lote: 3  Local: GO")
            const loteMatch = line.match(/Lote:\s*(\d+)/);
            if (loteMatch) {
                result.lote = loteMatch[1];
            }
            const localMatch = line.match(/Local:\s*(\S+)/);
            if (localMatch) {
                result.localLeilao = localMatch[1];
            }

            // Início date (e.g. "Início: 13/02/2026")
            const inicioMatch = line.match(/Início:\s*(\d{2}\/\d{2}\/\d{4})/);
            if (inicioMatch) {
                result.previsao = inicioMatch[1];
            }
        }

        return result;
    };

    const buscarTodasPaginas = async () => {
        console.log(`🚀 [${SITE}] Iniciando crawler (Puppeteer Mode)...`);

        const browser = await puppeteer.launch({
            headless: "new",
            args: ['--no-sandbox', '--disable-setuid-sandbox']
        });

        const listaCompleta = [];
        try {
            const page = await browser.newPage();
            page.on('console', msg => console.log('PAGE LOG:', msg.text()));
            await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36');

            console.log(`🔍 [${SITE}] Navegando para listagem...`);
            await page.goto(BASE_URL, { waitUntil: 'networkidle2', timeout: TIMEOUT });

            // Wait for vehicle cards with the new selector
            console.log(`⌛ [${SITE}] Aguardando cards...`);
            await page.waitForSelector('.card-anuncio', { timeout: 20000 }).catch(() => null);

            // Scroll down to trigger lazy loading of all cards
            await page.evaluate(async () => {
                for (let i = 0; i < 10; i++) {
                    window.scrollBy(0, 500);
                    await new Promise(r => setTimeout(r, 300));
                }
            });
            await new Promise(r => setTimeout(r, 2000));

            // Collect items from the page
            const itens = await page.evaluate((site) => {
                const results = [];
                const cards = document.querySelectorAll('.card-anuncio');
                console.log(`DEBUG: Found ${cards.length} .card-anuncio elements`);
                console.log(`DEBUG: HTML length: ${document.body.innerHTML.length}`);

                cards.forEach(card => {
                    const linkEl = card.querySelector('a');
                    const imgEl = card.querySelector('img');
                    const text = card.innerText.trim();

                    if (!linkEl) {
                        console.log('DEBUG: Card missing link');
                        return;
                    }

                    const link = linkEl.href;
                    // Extract slug from URL as registro (e.g. "jaguar-fpace-380cv-v6-s-96826")
                    const slug = link.split('/').pop();
                    // The numeric ID at the end is the unique identifier
                    const idMatch = slug.match(/(\d+)$/);
                    const registro = idMatch ? idMatch[1] : slug;

                    results.push({
                        registro,
                        site: site,
                        link: link,
                        fotos: imgEl && imgEl.src ? [imgEl.src] : [],
                        text: text
                    });
                });
                return results;
            }, SITE);

            console.log(`📦 [${SITE}] ${itens.length} cards encontrados, processando...`);

            for (const item of itens) {
                const parsed = parseCardText(item.text);
                listaCompleta.push({
                    registro: item.registro,
                    site: SITE,
                    link: item.link,
                    veiculo: (parsed.veiculo || 'VEÍCULO').toUpperCase(),
                    fotos: item.fotos,
                    valor: parsed.valor || parsed.valorInicial || 0,
                    valorInicial: parsed.valorInicial || 0,
                    km: parsed.km,
                    ano: parsed.ano,
                    descricao: `${parsed.veiculo} - ${parsed.ano || ''} - ${parsed.km}km`.trim(),
                    localLeilao: parsed.localLeilao || '',
                    previsao: parsed.previsao ? { string: parsed.previsao } : { string: '' },
                    modalidade: 'leilao',
                    tipo: 'veiculo'
                });
            }

            console.log(`✅ [${SITE}] ${listaCompleta.length} lotes capturados.`);
            if (listaCompleta.length > 0) {
                await salvarLista(listaCompleta);
            }
        } catch (error) {
            console.error(`❌ [${SITE}] Erro:`, error.message);
        } finally {
            await browser.close();
        }
        return listaCompleta.length;
    };

    return { buscarTodasPaginas, SITE };
};

export default createCrawler;
