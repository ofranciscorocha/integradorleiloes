// Debug HTML completo - pegando estrutura do cartão pai
import axios from 'axios';
import * as cheerio from 'cheerio';

const debug = async () => {
    console.log('🔍 Debug estrutura cartão\n');

    try {
        const { data } = await axios.postForm(
            'https://www.palaciodosleiloes.com.br/site/camada_ajax/coluna_esquerda_m.php',
            {
                quebra: '0.6543214025681199',
                opcao: 'listar_lote',
                categoria_pesquisa: '1',
                paginacao: '-1',
                total_paginas: '1'
            },
            { timeout: 15000 }
        );

        const $ = cheerio.load(data);

        // Pega o primeiro div.col-md-3 e mostra estrutura completa
        const firstCol = $('div.col-md-3').first();
        console.log('=== PRIMEIRO DIV.COL-MD-3 COMPLETO ===');
        console.log(firstCol.html());
        console.log('\n\n=== ANALISE ===');

        // Encontra o div.i-c dentro
        const ic = firstCol.find('div.i-c');
        console.log(`onclick do i-c: ${ic.attr('onclick')}`);

        // Pega todos os textos
        console.log('\nTextos encontrados:');
        firstCol.find('.inf').each((i, el) => {
            console.log(`  inf[${i}]: ${$(el).text().trim()}`);
        });

        firstCol.find('.h6, .my-0').each((i, el) => {
            console.log(`  h6/my-0[${i}]: ${$(el).text().trim()}`);
        });

        firstCol.find('.small').each((i, el) => {
            console.log(`  small[${i}]: ${$(el).text().trim()}`);
        });

    } catch (error) {
        console.error('Erro:', error.message);
    }
};

debug();
