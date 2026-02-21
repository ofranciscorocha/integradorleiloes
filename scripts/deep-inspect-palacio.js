import axios from 'axios';
import * as cheerio from 'cheerio';
import fs from 'fs';

const BASE_URL = 'https://www.palaciodosleiloes.com.br';
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

async function deepInspect() {
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

        fs.writeFileSync('palacio-ajax.html', data);
        console.log('Saved AJAX to palacio-ajax.html. Analyzing...');

        const $ = cheerio.load(data);
        const item = $('div.col-md-3').first();
        if (item.length > 0) {
            console.log('--- FIRST ITEM HTML ---');
            console.log(item.html());
            console.log('--- END ---');

            const onclick = item.find('[onclick]').attr('onclick');
            console.log('OnClick found:', onclick);

            const aHref = item.find('a').attr('href');
            console.log('HREF found:', aHref);
        } else {
            console.log('No items found with div.col-md-3 selector.');
        }

    } catch (error) {
        console.error('Error:', error.message);
    }
}

deepInspect();
