import fs from 'fs';
import * as cheerio from 'cheerio';

const analyzeSodre = () => {
    try {
        const html = fs.readFileSync('sodre-result.html', 'utf-8');
        const $ = cheerio.load(html);

        console.log('Title:', $('title').text());

        // Tenta achar cards
        const cards = $('div').filter((i, el) => {
            const txt = $(el).text();
            return txt.includes('Lote') && txt.includes('Lance');
        });

        console.log('Divs com Lote e Lance:', cards.length);

        if (cards.length > 0) {
            console.log('Primeiro card texto:', $(cards[0]).text().substring(0, 200));
            console.log('Classes do primeiro card:', $(cards[0]).attr('class'));
        }

        // Tenta achar imagens
        const imgs = $('img');
        console.log('Imagens encontradas:', imgs.length);

    } catch (e) {
        console.error(e);
    }
};

analyzeSodre();
