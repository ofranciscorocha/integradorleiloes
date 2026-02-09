// Teste simples para verificar se os crawlers conseguem fazer requisições aos sites
import axios from 'axios';
import * as cheerio from 'cheerio';

console.log('=== Teste de Crawlers de Leilões ===\n');

const testSites = [
    {
        name: 'Palácio dos Leilões',
        url: 'https://www.palaciodosleiloes.com.br/site/camada_ajax/coluna_esquerda_m.php',
        method: 'POST',
        formData: {
            quebra: '0.6543214025681199',
            opcao: 'listar_lote',
            categoria_pesquisa: '1',
            paginacao: '-1',
            total_paginas: '1'
        }
    },
    {
        name: 'VIP Leilões',
        url: 'https://www.vipleiloes.com.br/Veiculos/ListarVeiculos?Pagina=1&OrdenacaoVeiculo=InicioLeilao&Financiavel=False&Favoritos=False',
        method: 'GET'
    },
    {
        name: 'Guariglia Leilões',
        url: 'https://www.guariglialeiloes.com.br/',
        method: 'GET'
    }
];

async function testSite(site) {
    console.log(`🔍 Testando: ${site.name}`);
    console.log(`   URL: ${site.url.substring(0, 60)}...`);

    try {
        let response;

        if (site.method === 'POST') {
            response = await axios.postForm(site.url, site.formData, { timeout: 15000 });
        } else {
            response = await axios.get(site.url, { timeout: 15000 });
        }

        const html = response.data;
        const $ = cheerio.load(html);

        const divCount = $('div').length;
        const aCount = $('a').length;

        console.log(`   ✅ Sucesso! Status: ${response.status}`);
        console.log(`   📄 HTML: ${html.length} caracteres | ${divCount} divs, ${aCount} links\n`);

        return { success: true, site: site.name };
    } catch (error) {
        console.log(`   ❌ Erro: ${error.message}\n`);
        return { success: false, site: site.name, error: error.message };
    }
}

async function runTests() {
    const results = [];

    for (const site of testSites) {
        const result = await testSite(site);
        results.push(result);
    }

    console.log('=== Resumo ===');
    const successful = results.filter(r => r.success).length;
    console.log(`✅ ${successful}/${results.length} sites funcionando`);

    if (successful === results.length) {
        console.log('\n🎉 Todos os crawlers estão prontos!');
    }
}

runTests();
