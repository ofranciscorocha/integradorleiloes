import axios from 'axios';
import * as cheerio from 'cheerio';

const debug = async () => {
    console.log('🔍 Debug VIP Leilões - Busca Textual\n');

    try {
        const { data } = await axios.get(
            'https://www.vipleiloes.com.br/Veiculos/ListarVeiculos?Pagina=1&OrdenacaoVeiculo=InicioLeilao&Financiavel=False&Favoritos=False',
            {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
                }
            }
        );

        const $ = cheerio.load(data);

        // Procura por scripts que podem conter dados (JSON)
        $('script').each((i, el) => {
            const content = $(el).html();
            if (content && (content.includes('Veiculos') || content.includes('Lote') || content.includes('json'))) {
                console.log(`\n--- Script ${i} encontrado ---`);
                console.log(content.substring(0, 500)); // Mostra início
            }
        });

        // Procura por textos visíveis de veículos
        const bodyText = $('body').text();
        const keywords = ['Hyundai', 'Toyota', 'Honda', 'Fiat', 'Ford', 'Chevrolet'];

        console.log('\n--- Palavras-chave ---');
        keywords.forEach(key => {
            const count = (bodyText.match(new RegExp(key, 'gi')) || []).length;
            console.log(`${key}: ${count}`);
        });

        // Procura o elemento pai principal
        console.log('\n--- Estrutura ---');
        console.log($('main').html() ? 'Tem <main>' : 'Não tem <main>');
        console.log($('section').length + ' seções');

        // Tenta encontrar qualquer lista
        console.log($('ul').length + ' uls');
        console.log($('div[id]').length + ' divs com ID');

    } catch (error) {
        console.error('Error:', error.message);
    }
};

debug();
