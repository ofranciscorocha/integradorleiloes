import axios from 'axios';
import * as cheerio from 'cheerio';
import dotenv from 'dotenv';

dotenv.config();

const tratarDataHora = (dataStr) => {
    if (!dataStr) return { string: '', time: null, date: null };
    // Example: 15/02/2026 10h00
    const match = dataStr.match(/(\d{1,2})\/(\d{1,2})\/(\d{2,4}).*?(\d{1,2})h(\d{2})/);
    if (match) {
        let [, dia, mes, ano, hora, minuto] = match;
        if (ano.length === 2) ano = '20' + ano;
        const date = new Date(ano, mes - 1, dia, hora, minuto);
        return { string: dataStr, time: date.getTime(), date };
    }
    return { string: dataStr, time: null, date: null };
};

const createCrawler = (db) => {
    const { salvarLista } = db;
    const SITE = 'guariglialeiloes.com.br';
    const BASE_URL = 'https://www.guariglialeiloes.com.br';

    const getLeiloesAtivos = async () => {
        const leiloes = [];
        try {
            const { data } = await axios.get(BASE_URL, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
                    'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7',
                    'Cache-Control': 'no-cache',
                    'Pragma': 'no-cache',
                    'Sec-Ch-Ua': '"Not A(Brand";v="99", "Google Chrome";v="121", "Chromium";v="121"',
                    'Sec-Ch-Ua-Mobile': '?0',
                    'Sec-Ch-Ua-Platform': '"Windows"',
                    'Sec-Fetch-Dest': 'document',
                    'Sec-Fetch-Mode': 'navigate',
                    'Sec-Fetch-Site': 'none',
                    'Sec-Fetch-User': '?1',
                    'Upgrade-Insecure-Requests': '1'
                }
            });
            const $ = cheerio.load(data);

            $('div.card-body.d-flex.flex-column').each((index, div) => {
                const titulo = $(div).find('div.titulo-leilao').text().trim();
                const url = $(div).find('div.descricao-leilao.my-auto a').attr('href');
                const dataHoraRaw = $(div).find('div.descricao-leilao.my-auto a strong').text().trim();

                if (url && url.includes('/leilao/')) {
                    leiloes.push({
                        titulo,
                        url: url.startsWith('http') ? url : `${BASE_URL}${url}`,
                        dataHora: tratarDataHora(dataHoraRaw)
                    });
                }
            });
        } catch (e) {
            console.error(`❌ [${SITE}] Erro ao buscar leilões ativos:`, e.message);
        }
        return leiloes;
    };

    const scrapeLeilao = async (leilao) => {
        const results = [];
        let pagina = 1;
        let hasMore = true;

        console.log(`   🔍 [${SITE}] Processando: ${leilao.titulo}`);

        while (hasMore) {
            try {
                const url = `${leilao.url}?page=${pagina}`;
                const { data } = await axios.get(url, {
                    headers: { 'User-Agent': 'Mozilla/5.0' }
                });
                const $ = cheerio.load(data);
                const currentBatch = [];

                $('div.lote.rounded').each((index, div) => {
                    const divInfo = $(div).find('div.col-lg-7 div.body-lote');
                    const divLance = $(div).find('div.col-lg-3 div.lance-lote');
                    const divImg = $(div).find('div.col-lg-2 img, div.img-lote img, img');
                    const urlLote = $(divInfo).find('a').attr('href');

                    if (!urlLote) return;

                    const textoCompleto = $(divInfo).find('p').text();
                    const linhas = textoCompleto.split('\n').map(l => l.trim()).filter(Boolean);

                    // Extrair Marca/Modelo - pegar APENAS o valor do veículo, sem o label
                    let veiculo = 'VEÍCULO';
                    const linhaMarca = linhas.find(l => /marca\s*\/?\s*modelo/i.test(l));
                    if (linhaMarca) {
                        // Remove TUDO que seja "Marca/Modelo", "Marca / Modelo", etc + ":" se existir
                        veiculo = linhaMarca
                            .replace(/marca\s*\/?\s*modelo\s*:?\s*/gi, '')
                            .trim();
                        // Se ficou vazio, pega a parte depois do ":"
                        if (!veiculo && linhaMarca.includes(':')) {
                            veiculo = linhaMarca.split(':').slice(1).join(':').trim();
                        }
                    }
                    // Fallback: pega a primeira linha que pareça um nome de veículo
                    if (!veiculo || veiculo === 'VEÍCULO' || veiculo.length < 2) {
                        veiculo = linhas[0] || 'VEÍCULO';
                        // Limpar caso a primeira linha também tenha o prefixo
                        veiculo = veiculo.replace(/marca\s*\/?\s*modelo\s*:?\s*/gi, '').trim();
                    }

                    const ano = linhas.find(l => l.includes('Ano'))?.split(':')[1]?.trim() || '';
                    const placa = linhas.find(l => l.includes('Placa'))?.split(':')[1]?.trim() || '';
                    const valorStr = $(divLance).find('div.lance_atual').text().replace(/[^0-9,]/g, '').replace(',', '.');

                    // Extrair foto
                    const fotos = [];
                    const imgSrc = divImg.first().attr('src') || divImg.first().attr('data-src');
                    if (imgSrc) {
                        const fotoUrl = imgSrc.startsWith('http') ? imgSrc : `${BASE_URL}${imgSrc}`;
                        fotos.push(fotoUrl);
                    }

                    currentBatch.push({
                        site: SITE,
                        registro: urlLote.split('/').filter(Boolean).pop(),
                        link: urlLote.startsWith('http') ? urlLote : `${BASE_URL}${urlLote}`,
                        veiculo: veiculo.toUpperCase(),
                        ano: parseInt(ano) || null,
                        valor: parseFloat(valorStr) || 0,
                        valorInicial: parseFloat(valorStr) || 0,
                        previsao: leilao.dataHora,
                        modalidade: 'leilao',
                        tipo: 'veiculo',
                        fotos,
                        placa: placa || undefined
                    });
                });

                if (currentBatch.length === 0) {
                    hasMore = false;
                } else {
                    results.push(...currentBatch);
                    await salvarLista(currentBatch);
                    pagina++;
                    // Basic delay
                    await new Promise(r => setTimeout(r, 500));
                }
            } catch (e) {
                console.error(`      ⚠️ Erro na página ${pagina} do leilão ${leilao.titulo}:`, e.message);
                hasMore = false;
            }
        }
        return results;
    };

    const buscarTodos = async () => {
        console.log(`🚀 [${SITE}] INICIANDO COLETA TURBO...`);
        const leiloes = await getLeiloesAtivos();
        console.log(`   📊 [${SITE}] Encontrados ${leiloes.length} leilões ativos.`);

        let total = 0;
        for (const leilao of leiloes) {
            const itens = await scrapeLeilao(leilao);
            total += itens.length;
        }

        console.log(`✅ [${SITE}] Finalizado! ${total} veículos coletados.`);
        return total;
    };

    return { buscarTodos, SITE };
};

export default createCrawler;
