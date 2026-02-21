
import axios from 'axios';
import * as cheerio from 'cheerio';

const inspect = async () => {
    const url = 'https://www.danielgarcialeiloes.com.br';
    try {
        const { data } = await axios.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
        const $ = cheerio.load(data);
        console.log(`URL: ${url}`);
        console.log(`.lote: ${$('.lote').length}`);
        console.log(`.card-lote: ${$('.card-lote').length}`);
        console.log(`.lote-card: ${$('.lote-card').length}`);
        console.log(`.item-lote: ${$('.item-lote').length}`);
        console.log(`.card: ${$('.card').length}`);

        // Find links
        const links = [];
        $('a').each((i, el) => {
            const href = $(el).attr('href');
            if (href && (href.includes('/lote/') || href.includes('/item/'))) {
                links.push(href);
            }
        });
        console.log(`Potential links: ${links.slice(0, 5).join(', ')}`);

    } catch (e) {
        console.log(`Error: ${e.message}`);
    }
};

inspect();
