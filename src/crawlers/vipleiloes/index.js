import axios from 'axios';
import * as cheerio from 'cheerio';
import dotenv from 'dotenv';

dotenv.config();

const TIMEOUT = parseInt(process.env.CRAWLER_TIMEOUT_MS) || 15000;
const DELAY = parseInt(process.env.CRAWLER_DELAY_MS) || 5000;

/**
 * Crawler do VIP Leilões
 */
const createCrawler = (db) => {
    const { salvarLista, list } = db;
    const SITE = 'vipleiloes.com.br';

    /**
     * Utilitário para delay
     */
    const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

    /**
     * Busca uma página de veículos
     */
    const getPagina = async (pagina) => {
        console.log(`📄 [${SITE}] Buscando página ${pagina}...`);

        try {
            const { data } = await axios.get(
                `https://www.vipleiloes.com.br/Portal/Veiculos/ListarVeiculos?Pagina=${pagina}&OrdenacaoVeiculo=InicioLeilao&Financiavel=False&Favoritos=False`,
                { timeout: TIMEOUT }
            );

            const $ = cheerio.load(data);
            const lista = [];

            const totalText = $('div.col-md-12.tituloListagem h4').text();
            const total = parseInt(totalText.replace(/[^\d]/g, '')) || 0;

            $('div.itm-card').each((index, div) => {
                const dados = { original: {} };
                const body = $(div).find('div.itm-body');
                const firstline = $(body).find('div.itm-firstline p.itm-info');

                dados.original.url = $(div).find('a.itm-cdlink').attr('href');
                dados.original.registro = dados.original.url?.split('/').pop();

                $(firstline).each((idx, i) => {
                    if (idx === 0) {
                        const loteText = $(i).text().split(':')[1];
                        dados.lote = loteText?.trim();
                        dados.original.lote = dados.lote;
                    } else {
                        const localText = $(i).text().split(':')[1];
                        dados.local = localText?.trim();
                        dados.original.local = dados.local;
                    }
                });

                dados.registro = dados.original.registro;
                dados.original.bem = $(body).find('h4.itm-name').text().replace(/\n/g, ' ').trim();
                dados.veiculo = dados.original.bem;
                dados.site = SITE;
                dados.link = `https://www.vipleiloes.com.br${dados.original.url}`;

                if (dados.registro && !lista.find(({ registro }) => registro === dados.registro)) {
                    lista.push(dados);
                }
            });

            return { total, lista, pagina };
        } catch (error) {
            console.error(`❌ [${SITE}] Erro na página ${pagina}:`, error.message);
            return { total: 0, lista: [], pagina };
        }
    };

    /**
     * Busca todas as páginas e salva
     */
    const buscarTodasPaginas = async (timeout = DELAY) => {
        console.log(`\n🔍 [${SITE}] Iniciando busca...`);

        let paginaAtual = 1;
        let totalProcessado = 0;
        let continuar = true;

        while (continuar) {
            const { total, lista, pagina } = await getPagina(paginaAtual);

            if (lista.length > 0) {
                await salvarLista(lista);
                totalProcessado += lista.length;
                console.log(`✅ [${SITE}] Página ${pagina}: ${lista.length} veículos (${totalProcessado}/${total})`);
            }

            const totalPaginas = Math.ceil(total / 10);

            if (paginaAtual >= totalPaginas || lista.length === 0) {
                continuar = false;
            } else {
                paginaAtual++;
                await sleep(timeout);
            }
        }

        console.log(`✅ [${SITE}] Busca finalizada! ${totalProcessado} veículos processados.`);
        return totalProcessado;
    };

    /**
     * Busca detalhes de um veículo específico
     */
    const buscarDetalhes = async (registro) => {
        try {
            const { data } = await axios.get(
                `https://www.vipleiloes.com.br/Veiculo/Detalhes/${registro}`,
                { timeout: TIMEOUT }
            );

            const $ = cheerio.load(data);
            const detalhes = {};

            // Extrai informações da página de detalhes
            $('div.veiculo-info p').each((idx, el) => {
                const text = $(el).text().trim();
                if (text.includes('Ano:')) detalhes.ano = text.split(':')[1]?.trim();
                if (text.includes('KM:')) detalhes.km = text.split(':')[1]?.trim();
                if (text.includes('Combustível:')) detalhes.combustivel = text.split(':')[1]?.trim();
            });

            detalhes.descricao = $('div.veiculo-descricao').text().trim();

            return detalhes;
        } catch (error) {
            console.error(`❌ [${SITE}] Erro ao buscar detalhes de ${registro}:`, error.message);
            return null;
        }
    };

    return {
        getPagina,
        buscarTodasPaginas,
        buscarDetalhes,
        SITE
    };
};

export default createCrawler;
