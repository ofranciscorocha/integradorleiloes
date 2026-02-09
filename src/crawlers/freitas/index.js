import axios from 'axios';
import * as cheerio from 'cheerio';
import https from 'https';
import connectDatabase from '../../database/db.js';

let db;

const run = async () => {
    try {
        const connection = await connectDatabase();

        console.log('--- Iniciando Crawler Freitas Leiloeiro ---');
        await execute(connection);

        console.log('--- Finalizado Freitas ---');
        process.exit(0);
    } catch (error) {
        console.error('Erro fatal:', error);
        process.exit(1);
    }
};

export const execute = async (database) => {
    db = database;
    const agent = new https.Agent({
        rejectUnauthorized: false
    });
    const baseUrl = 'https://www.freitasleiloeiro.com.br';

    let page = 1;
    let hasNext = true;
    let totalCapturados = 0;

    // Limite de segurança 20 pgs para evitar loop infinito
    while (hasNext && page <= 20) {
        console.log(`Buscando página ${page}...`);

        try {
            const url = `${baseUrl}/Leiloes/PesquisarLotes`;
            const { data } = await axios.get(url, {
                params: {
                    Categoria: 1,
                    PageNumber: page,
                    TopRows: 50
                },
                httpsAgent: agent,
                headers: {
                    'X-Requested-With': 'XMLHttpRequest',
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
                }
            });

            // Verifica se retornou HTML válido ou mensagem de fim
            if (!data || (typeof data === 'string' && (data.includes('Nenhum lote localizado') || data.includes('Não foram localizados mais lotes')))) {
                console.log('Fim da paginação.');
                hasNext = false;
                break;
            }

            const $ = cheerio.load(data);
            const cards = $('.cardlote');

            if (cards.length === 0) {
                console.log('Nenhum card encontrado nesta página.');
                hasNext = false;
                break;
            }

            const veiculos = [];

            cards.each((i, el) => {
                const $el = $(el);
                const lote = $el.find('.cardLote-lote').text().trim();
                const linkSuffix = $el.find('a').first().attr('href');
                const link = linkSuffix ? baseUrl + linkSuffix : '';
                const img = $el.find('.cardLote-img').attr('src');
                const descricao = $el.find('.cardLote-descVeic span').text().trim();
                const valor = $el.find('.cardLote-vlr').text().replace('R$', '').trim();

                // Data vem quebrada em spans
                const dia = $el.find('.cardLote-data span').first().text().trim();
                const hora = $el.find('.cardLote-data span').last().text().trim();
                const dataLeilao = `${dia} ${hora}`;

                if (descricao) {
                    veiculos.push({
                        registro: lote,
                        site: 'freitasleiloeiro.com.br',
                        link,
                        veiculo: descricao,
                        fotos: img ? [img] : [],
                        valorInicial: valor ? parseFloat(valor.replace(/\./g, '').replace(',', '.')) : 0,
                        modalidade: 'leilao',
                        localLeilao: 'São Paulo/SP',
                        ano: getDataAno(descricao),
                        previsao: { string: dataLeilao }
                    });
                }
            });

            console.log(`Encontrados ${veiculos.length} veículos na página ${page}`);

            if (veiculos.length > 0) {
                const resultado = await db.salvarLista(veiculos);
                totalCapturados += veiculos.length;
                console.log(`Salvos ${veiculos.length} veículos da página ${page}`);
            } else {
                hasNext = false;
            }

            page++;
            // Delay de cortesia
            await new Promise(r => setTimeout(r, 1000));

        } catch (error) {
            console.error(`Erro na página ${page}:`, error.message);
            hasNext = false;
        }
    }

    console.log(`Total capturado Freitas: ${totalCapturados}`);
};

const getDataAno = (desc) => {
    // Tenta extrair ano de strings como "MODELO 10/11" ou "2010/2011"
    const regex = /(\d{2,4})\/(\d{2,4})/;
    const match = desc.match(regex);
    if (match) return match[0];
    return null;
};

// Auto-run se chamado diretamente
// Verificacao simplificada para evitar erro de path
if (process.argv[1].includes('freitas')) {
    run();
}

export default { run, execute };
