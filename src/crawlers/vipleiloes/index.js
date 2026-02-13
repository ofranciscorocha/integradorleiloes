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

    const buscarTodasPaginas = async () => {
        console.log(`🚀 [${SITE}] HIGH-YIELD: Iniciando Turbo-Pagination via API...`);

        const browser = await puppeteer.launch({
            headless: "new",
            args: ['--no-sandbox', '--disable-setuid-sandbox', '--window-size=1920,1080']
        });

        const listaTotal = [];
        try {
            const page = await browser.newPage();
            await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36');

            // Navigate once to set cookies/session
            await page.goto(BASE_URL, { waitUntil: 'networkidle2', timeout: TIMEOUT });

            let capturados = 0;
            // Iterate through pagination (sk = skip)
            for (let skip = 0; skip < 1500; skip += 24) {
                console.log(`   🔍 [${SITE}] Buscando offset: ${skip}...`);

                const responseData = await page.evaluate(async (sk) => {
                    try {
                        const res = await fetch('https://www.vipleiloes.com.br/Pesquisa/GetLotes', {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/json',
                                'X-Requested-With': 'XMLHttpRequest'
                            },
                            body: JSON.stringify({
                                st: 2, // Ativo/Em aberto
                                sk: sk, // Skip
                                tp: 1, // Tipo?
                                bt: "veiculos" // Busca termo
                            })
                        });
                        return await res.json();
                    } catch (e) {
                        return null;
                    }
                }, skip);

                if (!responseData || !responseData.lotes || responseData.lotes.length === 0) {
                    console.log(`   ✅ [${SITE}] Fim dos resultados no offset ${skip}.`);
                    break;
                }

                const batch = responseData.lotes.map(lote => {
                    // Extract model and year from title if possible
                    const title = lote.lote_nome || lote.lote_descricao_resumida || 'VEICULO';
                    const link = `https://www.vipleiloes.com.br/leilao/lote/${lote.leilao_id}/${lote.lote_id}`;

                    return {
                        registro: String(lote.lote_id),
                        site: SITE,
                        veiculo: title.toUpperCase(),
                        link: link,
                        fotos: lote.lote_foto_capa ? [lote.lote_foto_capa] : [],
                        valor: parseFloat(lote.lote_valor_lance_atual || lote.lote_valor_incremento || 0),
                        localLeilao: lote.leilao_cidade || 'Brasil',
                        previsao: { string: lote.leilao_data_abertura || '' },
                        modalidade: 'leilao',
                        tipo: 'veiculo'
                    };
                });

                if (batch.length > 0) {
                    await salvarLista(batch);
                    listaTotal.push(...batch);
                    capturados += batch.length;
                    console.log(`   🔸 [${SITE}] Turbo-Mode: +${batch.length} veículos. Total: ${capturados}`);
                }

                // Add small delay to be polite
                await new Promise(r => setTimeout(r, 1000));
            }

        } catch (error) {
            console.error(`❌ [${SITE}] Erro Turbo:`, error.message);
        } finally {
            await browser.close();
        }
        return listaTotal.length;
    };

    return { buscarTodasPaginas, SITE };
};

export default createCrawler;
