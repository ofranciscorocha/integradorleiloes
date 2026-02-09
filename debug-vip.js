import axios from 'axios';
import * as cheerio from 'cheerio';

const debug = async () => {
    console.log('🔍 Debug VIP Leilões\n');

    try {
        const { data } = await axios.get(
            'https://www.vipleiloes.com.br/Veiculos/ListarVeiculos?Pagina=1&OrdenacaoVeiculo=InicioLeilao&Financiavel=False&Favoritos=False',
            { timeout: 15000 }
        );

        const $ = cheerio.load(data);

        console.log(`HTML total: ${data.length} chars`);
        console.log(`div count: ${$('div').length}`);
        console.log(`a count: ${$('a').length}`);

        // Check specific classes from original code
        console.log(`div.itm-card: ${$('div.itm-card').length}`);
        console.log(`div.card: ${$('div.card').length}`);
        console.log(`div.leilao: ${$('div.leilao').length}`);

        // Dump first 2000 chars of body
        console.log('\n--- BODY SAMPLE ---');
        console.log($('body').html().substring(0, 2000));

    } catch (error) {
        console.error('Error:', error.message);
    }
};

debug();
