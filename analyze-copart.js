import fs from 'fs';
import * as cheerio from 'cheerio';

const analyzeCopart = () => {
    try {
        const html = fs.readFileSync('copart-result.html', 'utf-8');
        const $ = cheerio.load(html);

        console.log('Title:', $('title').text());

        // Copart usa DataTables geralmente, ou Angular cards
        // O selector achado antes era #serverSideDataTable

        const table = $('#serverSideDataTable');
        console.log('Tabela encontrada:', table.length);

        const rows = table.find('tr');
        console.log('Linhas na tabela:', rows.length);

        if (rows.length > 0) {
            // Analisa primeira linha de dados (pula header)
            const row = $(rows[1]); // indice 1 assumindo header no 0
            console.log('HTML da linha 1:', row.html().substring(0, 500));
            console.log('Texto da linha 1:', row.text().replace(/\s+/g, ' ').trim());

            // Tenta identificar colunas
            row.find('td').each((i, el) => {
                console.log(`Col ${i}:`, $(el).text().trim());
            });
        }

        // Tenta achar imagens
        console.log('Imagens Totais:', $('img').length);

    } catch (e) {
        console.error(e);
    }
};

analyzeCopart();
