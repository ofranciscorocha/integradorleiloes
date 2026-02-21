import axios from 'axios';
import * as cheerio from 'cheerio';

const BASE_URL = 'https://www.palaciodosleiloes.com.br';
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

async function checkLink() {
    try {
        console.log('Fetching AJAX category (Carros)...');
        const catId = 1;
        const url = `${BASE_URL}/site/camada_ajax/coluna_esquerda_m.php?quebra=${Math.random()}&&opcao=listar_lote&categoria_pesquisa=${catId}&tipo_exibicao=grid&paginacao=-1`;

        const { data } = await axios.post(url,
            `opcao=listar_lote&categoria_pesquisa=${catId}&tipo_exibicao=grid&paginacao=-1`,
            {
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'User-Agent': USER_AGENT,
                    'Referer': BASE_URL,
                    'X-Requested-With': 'XMLHttpRequest'
                },
                timeout: 30000
            });

        const $ = cheerio.load(data);

        // Let's look for specific detail links
        const detailedLinks = [];
        $('a').each((i, el) => {
            const href = $(el).attr('href');
            if (href && href.includes('lote') && !href.startsWith('#')) {
                detailedLinks.push(href);
            }
        });

        console.log('Found detail-like links:', detailedLinks);

        if ($('div.col-md-3').length > 0) {
            console.log('Found items. Printing first item structure:');
            console.log($('div.col-md-3').first().html().substring(0, 1000));
        } else {
            console.log('No item containers found with div.col-md-3');
            console.log('Data length:', data.length);
            console.log('Snippet:', data.substring(0, 500));
        }

    } catch (error) {
        console.error('Error in diagnostic script:', error.message);
    }
}

checkLink();
