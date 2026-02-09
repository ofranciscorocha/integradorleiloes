import axios from 'axios';
import * as cheerio from 'cheerio';
import dotenv from 'dotenv';

dotenv.config();

const TIMEOUT = parseInt(process.env.CRAWLER_TIMEOUT_MS) || 15000;
const DELAY = parseInt(process.env.CRAWLER_DELAY_MS) || 5000;

/**
 * Trata string de data/hora
 */
const tratarDataHora = (dataHoraStr) => {
    if (!dataHoraStr) return { string: '', time: null, date: null };

    const str = dataHoraStr.trim();

    // Padrão: "DD/MM/YYYY às HH:MM" ou similar
    const match = str.match(/(\d{1,2})\/(\d{1,2})\/(\d{2,4}).*?(\d{1,2}):(\d{2})/);

    if (match) {
        let [, dia, mes, ano, hora, minuto] = match;
        if (ano.length === 2) ano = '20' + ano;

        const date = new Date(ano, mes - 1, dia, hora, minuto);
        return {
            string: str,
            time: date.getTime(),
            date
        };
    }

    return { string: str, time: null, date: null };
};

/**
 * Crawler do Guariglia Leilões
 */
const createCrawler = (db) => {
    const { salvarLista } = db;
    const SITE = 'guariglialeiloes.com.br';

    /**
     * Utilitário para delay
     */
    const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

    /**
     * Busca lista de leilões ativos na página principal
     */
    const getLeiloesAtivos = async () => {
        console.log(`\n🔍 [${SITE}] Buscando leilões ativos...`);

        try {
            const { data } = await axios.get('https://www.guariglialeiloes.com.br/', { timeout: TIMEOUT });
            const $ = cheerio.load(data);
            const leiloes = [];

            $('div.card-body.d-flex.flex-column').each((index, div) => {
                const titulo = $(div).find('div.titulo-leilao').text().replace(/\n/g, ' ').trim();
                const url = $(div).find('div.descricao-leilao.my-auto a').attr('href');

                if (!url) return;

                const splitUrl = url.split('/');
                const leilao = splitUrl[splitUrl.length - 2];
                const linhaDataHora = $(div).find('div.descricao-leilao.my-auto a strong').text();
                const dataHora = tratarDataHora(linhaDataHora);

                leiloes.push({ titulo, url, leilao, dataHora });
            });

            console.log(`✅ [${SITE}] ${leiloes.length} leilões encontrados`);
            return leiloes;
        } catch (error) {
            console.error(`❌ [${SITE}] Erro ao buscar leilões:`, error.message);
            return [];
        }
    };

    /**
     * Busca veículos de um leilão específico
     */
    const buscarVeiculosLeilao = async (leilao) => {
        const { url, dataHora, leilao: numero, titulo } = leilao;
        let pagina = 0;
        let totalLotes = 0;

        console.log(`📋 [${SITE}] Processando: ${titulo}`);

        try {
            let lotes = [];

            do {
                pagina++;
                const { data } = await axios.get(`${url}?page=${pagina}`, { timeout: TIMEOUT });
                const $ = cheerio.load(data);
                lotes = [];

                $('div.lote.rounded').each((index, div) => {
                    const divInfo = $(div).find('div.col-lg-7 div.body-lote');
                    const divLance = $(div).find('div.col-lg-3 div.lance-lote');
                    const urlLote = $(divInfo).find('a').attr('href');

                    if (!urlLote) return;

                    const splitUrl = urlLote.split('/');
                    const lote = splitUrl.length === 6 ? splitUrl[4] : null;
                    const texto = $(divInfo).find('p').text();
                    const linhas = texto.split('\n');
                    const maiorLanceTexto = $(divLance).find('div.lance_atual').text();
                    const maiorLance = maiorLanceTexto.replace('.', '').replace(',', '.').replace('R$', '').trim();
                    const status = $(divLance).find('div.label_lote').text().trim();

                    const infos = {
                        site: SITE,
                        link: urlLote,
                        registro: { lote },
                        ultimoLanceValor: isNaN(maiorLance) ? maiorLance : Number(maiorLance),
                        dataInicio: dataHora.date,
                        previsao: dataHora
                    };

                    // Extrai informações do texto
                    linhas.forEach(linha => {
                        const dado = linha.split(':')[1];
                        if (linha.includes('Marca') && dado) {
                            infos.veiculo = dado.trim();
                        } else if (linha.includes('Ano') && dado) {
                            infos.ano = dado.trim();
                        } else if (linha.includes('KM') && dado) {
                            const km = linha.split('KM:')[1]?.replace('.', '').trim();
                            infos.km = isNaN(km) ? km : Number(km);
                        }
                    });

                    infos.original = {
                        leilao: { titulo, numero, url },
                        urlLote,
                        maiorLanceTexto,
                        status,
                        textoCompleto: texto
                    };

                    lotes.push(infos);
                });

                if (lotes.length > 0) {
                    await salvarLista(lotes);
                    totalLotes += lotes.length;
                    console.log(`   Página ${pagina}: ${lotes.length} lotes`);
                }

                await sleep(DELAY);
            } while (lotes.length > 0);

        } catch (error) {
            console.error(`❌ [${SITE}] Erro no leilão ${titulo}:`, error.message);
        }

        return totalLotes;
    };

    /**
     * Busca todos os veículos de todos os leilões
     */
    const buscarTodos = async () => {
        const leiloes = await getLeiloesAtivos();
        let totalGeral = 0;

        for (const leilao of leiloes) {
            const total = await buscarVeiculosLeilao(leilao);
            totalGeral += total;
        }

        console.log(`\n✅ [${SITE}] Total: ${totalGeral} veículos processados de ${leiloes.length} leilões`);
        return totalGeral;
    };

    return {
        getLeiloesAtivos,
        buscarVeiculosLeilao,
        buscarTodos,
        SITE
    };
};

export default createCrawler;
