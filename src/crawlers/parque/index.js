import axios from 'axios';
import * as cheerio from 'cheerio';
import { parseVehicleDetails } from '../../utils/vehicle-parser.js';
import dotenv from 'dotenv';

dotenv.config();

const createCrawler = (db) => {
    const { salvarLista } = db;
    const SITE = 'parquedosleiloes.com.br';
    const BASE_URL = 'https://www.parquedosleiloes.com.br';

    const buscarTodasPaginas = async (maxPaginas = 50) => {
        console.log(`🚀 [${SITE}] SUPERCRAWLER AXIOS: Iniciando captura...`);
        let totalCapturados = 0;
        let pagina = 1;
        let hasMore = true;

        const headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
            'Referer': BASE_URL
        };

        while (hasMore && pagina <= maxPaginas) {
            console.log(`🔍 [${SITE}] Buscando página ${pagina}...`);
            const url = `${BASE_URL}/leiloes?is_lot=1&searchMode=normal&page=${pagina}`;

            try {
                const response = await axios.get(url, { headers, timeout: 30000 });
                const $ = cheerio.load(response.data);
                const items = [];

                $('.auction-lot-card').each((i, el) => {
                    const card = $(el);
                    const linkEl = card.find('.thumbnail a');
                    const h3El = card.find('.name');

                    if (!linkEl.length || !h3El.length) return;

                    const title = h3El.text().trim().toUpperCase();
                    const link = linkEl.attr('href');
                    const registro = link.split('/').pop();
                    const details = card.find('.comments-text').text().trim() || '';

                    const imgEl = card.find('img');
                    let imgUrl = imgEl.attr('src');

                    if (imgUrl && !imgUrl.startsWith('http')) {
                        imgUrl = BASE_URL + imgUrl;
                    }

                    // Categorization Logic
                    let tipo = 'veiculo';
                    const textUpper = (title + ' ' + details).toUpperCase();

                    if (textUpper.includes('CASA') || textUpper.includes('APARTAMENTO') || textUpper.includes('TERRENO') || textUpper.includes('IMÓVEL') || textUpper.includes('IMOVEL') || textUpper.includes('GALPÃO') || textUpper.includes('SÍTIO') || textUpper.includes('CHÁCARA')) {
                        tipo = 'imovel';
                    } else if (textUpper.includes('SUCATA') || textUpper.includes('PEÇAS') || textUpper.includes('DIVERSOS') || textUpper.includes('LOTE') || textUpper.includes('MÓVEIS') || textUpper.includes('ELETRO') || textUpper.includes('INFORMÁTICA')) {
                        tipo = 'diversos';
                    }

                    const parsed = parseVehicleDetails(title + ' ' + details);

                    items.push({
                        registro,
                        site: SITE,
                        veiculo: title,
                        link,
                        fotos: imgUrl ? [imgUrl] : [],
                        descricao: details,
                        localLeilao: 'DF', // Default for Parque
                        modalidade: 'leilao',
                        tipo,
                        ano: parsed.ano,
                        condicao: parsed.condicao,
                        combustivel: parsed.combustivel,
                        km: parsed.km,
                        cor: parsed.cor,
                        cambio: parsed.cambio,
                        blindado: parsed.blindado
                    });
                });

                if (items.length === 0) {
                    console.log(`   🔸 [${SITE}] Sem itens na página ${pagina}. Fim.`);
                    hasMore = false;
                    break;
                }

                // Save items
                await salvarLista(items);
                totalCapturados += items.length;
                console.log(`   ✅ [${SITE}] Página ${pagina}: ${items.length} itens capturados.`);

                // Check for next page (naive check: if returns items, try next)
                // Better check: check pagination element if exists
                if (!$('.pagination .next').length && !$('.pagination li.next').length) {
                    console.log(`   🔸 [${SITE}] Paginação terminou.`);
                    hasMore = false;
                } else {
                    pagina++;
                }

                // Respectful delay
                await new Promise(r => setTimeout(r, 1000));

            } catch (error) {
                console.error(`❌ [${SITE}] Erro na página ${pagina}: ${error.message}`);
                // If 404 or specific error, maybe break
                if (error.response && error.response.status === 404) hasMore = false;
                else pagina++; // try next?? or retry? Let's skip to next for now
            }
        }

        console.log(`✅ [${SITE}] Finalizado: ${totalCapturados} itens coletados.`);
        return totalCapturados;
    };

    return { buscarTodasPaginas, SITE, buscarTodos: buscarTodasPaginas };
};

export default createCrawler;
