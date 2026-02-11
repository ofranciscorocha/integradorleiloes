import axios from 'axios';
import * as cheerio from 'cheerio';
import dotenv from 'dotenv';

dotenv.config();

const TIMEOUT = parseInt(process.env.CRAWLER_TIMEOUT_MS) || 30000;
const DELAY = parseInt(process.env.CRAWLER_DELAY_MS) || 3000;

/**
 * Crawler do Parque dos Leilões
 */
const createCrawler = (db) => {
    const { salvarLista } = db;
    const SITE = 'parquedosleiloes.com.br';
    const BASE_URL = 'https://www.parquedosleiloes.com.br';

    const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

    const getPagina = async (pagina) => {
        console.log(`📄 [${SITE}] Buscando página ${pagina}...`);

        try {
            const { data } = await axios.get(
                `${BASE_URL}/leiloes?is_lot=1&searchMode=normal&page=${pagina}`,
                {
                    timeout: TIMEOUT,
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
                    }
                }
            );

            const $ = cheerio.load(data);
            const lista = [];

            // Tenta obter o total de páginas ou itens (não é óbvio no HTML, mas vamos usar a lista vazia como stop)
            const cards = $('div.auction-lot-card');

            cards.each((index, el) => {
                const card = $(el);
                const title = card.find('.name').text().trim();
                const link = card.find('.thumbnail a').attr('href');
                const foto = card.find('.thumbnail img').attr('src');
                const info = card.find('.comments-text').text().trim();
                const statusText = card.find('.badges .badge').text().trim();

                // Registro é o último número da URL se for /lote/XXXX
                const registro = link?.split('/').pop();

                // Extrair Data (Ex: Lances On-Line até 11/02/26 13:00:00)
                let dataLeilao = null;
                const dateMatch = statusText.match(/(\d{2}\/\d{2}\/\d{2,4}\s\d{2}:\d{2}:\d{2})/);
                if (dateMatch) {
                    const [datePart, timePart] = dateMatch[1].split(' ');
                    const [d, m, y] = datePart.split('/');
                    const fullYear = y.length === 2 ? `20${y}` : y;
                    dataLeilao = `${fullYear}-${m}-${d}T${timePart}`;
                }

                if (title && registro) {
                    lista.push({
                        registro,
                        veiculo: title,
                        link: link?.startsWith('http') ? link : `${BASE_URL}${link}`,
                        foto: foto?.startsWith('http') ? foto : `${BASE_URL}${foto}`,
                        descricao: info,
                        dataLeilao: dataLeilao,
                        site: SITE,
                        tipo: title.toLowerCase().includes('moto') ? 'moto' : (title.toLowerCase().includes('caminhão') || title.toLowerCase().includes('ônibus') ? 'pesado' : 'carro'),
                        valor: 0, // Não disponível na listagem
                        localLeilao: 'DF' // Sede principal do Parque dos Leilões
                    });
                }
            });

            return { lista, pagina };
        } catch (error) {
            console.error(`❌ [${SITE}] Erro na página ${pagina}:`, error.message);
            return { lista: [], pagina };
        }
    };

    const buscarTodasPaginas = async (maxPaginas = 10) => {
        console.log(`\n🔍 [${SITE}] Iniciando busca...`);

        let paginaAtual = 1;
        let totalProcessado = 0;

        while (paginaAtual <= maxPaginas) {
            const { lista } = await getPagina(paginaAtual);

            if (lista.length === 0) break;

            await salvarLista(lista);
            totalProcessado += lista.length;
            console.log(`✅ [${SITE}] Página ${paginaAtual}: ${lista.length} veículos processados.`);

            paginaAtual++;
            await sleep(DELAY);
        }

        console.log(`✅ [${SITE}] Busca finalizada! ${totalProcessado} veículos processados.`);
        return totalProcessado;
    };

    return {
        getPagina,
        buscarTodasPaginas,
        SITE
    };
};

export default createCrawler;
