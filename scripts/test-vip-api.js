
import axios from 'axios';
import * as cheerio from 'cheerio';

const testVipApi = async () => {
    const pageNum = 1;
    const url = `https://www.vipleiloes.com.br/pesquisa?Filtro.CurrentPage=${pageNum}&OrdenacaoVeiculo=DataInicio`;
    console.log('Testing VIP GET:', url);

    try {
        const response = await axios.get(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
                'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7'
            }
        });

        console.log('Status:', response.status);
        const html = response.data;
        const $ = cheerio.load(html);
        const cards = $('.card-anuncio');
        console.log('Cards found:', cards.length);

        if (cards.length > 0) {
            const firstTitle = cards.eq(0).find('.anc-title h1').text().trim();
            console.log('First Vehicle:', firstTitle);
        } else {
            console.log('Response preview (500 chars):', html.toString().substring(0, 500));
        }

    } catch (error) {
        console.error('Error:', error.message);
    }
};

testVipApi();
