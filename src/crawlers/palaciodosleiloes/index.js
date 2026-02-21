import axios from 'axios';
import * as cheerio from 'cheerio';
import dotenv from 'dotenv';
import fs from 'fs';
import { parseVehicleDetails, classifyVehicle, cleanTitle } from '../../utils/vehicle-parser.js';
import { standardizeStatus } from '../../utils/status.js';
import { getRandomUserAgent } from '../../utils/browser.js';

dotenv.config();

const tratarDataHora = (dataHoraStr) => {
    if (!dataHoraStr) return { string: '', time: null, date: null };
    const str = dataHoraStr.trim();
    const match = str.match(/(\d{1,2})\/(\d{1,2})\/(\d{2,4})(?:\s*(\d{1,2}):(\d{2}))?/);
    if (match) {
        let [, dia, mes, ano, hora, minuto] = match;
        if (ano.length === 2) ano = '20' + ano;
        hora = hora || '12';
        minuto = minuto || '00';
        const date = new Date(ano, mes - 1, dia, hora, minuto);
        return { string: str, time: date.getTime(), date };
    }
    return { string: str, time: null, date: null };
};

const createCrawler = (db) => {
    const { salvarLista } = db;
    const SITE = 'palaciodosleiloes.com.br';
    const BASE_URL = 'https://www.palaciodosleiloes.com.br';

    const dadosItem = (dado) => {
        const { registro, veiculo, ano, descricao, link, fotos, valor, previsao, localLeilao, condicao, tipo, combustivel, cor, km, cambio, blindado, situacaoRaw, chave, dataLeilao, localColisao, origem, comitente, debitoResponsabilidade, remarcado, anexos } = dado;

        const previsaoObj = tratarDataHora(previsao);

        return {
            site: SITE,
            registro,
            link,
            veiculo: cleanTitle(veiculo),
            ano: ano,
            descricao: descricao || '',
            fotos: fotos || [],
            valor: parseFloat(valor) || 0,
            valorInicial: parseFloat(valor) || 0,
            previsao: previsaoObj,
            dataLeilao: dataLeilao || (previsaoObj.date ? previsaoObj.date.toISOString() : null),
            localLeilao: localLeilao || 'Palácio dos Leilões',
            condicao: condicao || 'Conservado',
            modalidade: 'leilao',
            tipo: tipo || 'veiculo',
            combustivel,
            cor,
            km,
            cambio,
            chave,
            blindado,
            situacao: standardizeStatus(situacaoRaw),

            // NINJA ELITE DEEP FIELDS
            localColisao,
            origem,
            comitente,
            debitoResponsabilidade,
            remarcado,
            anexos: anexos || []
        };
    };

    const listarPorCategoria = async (catId) => {
        const catNames = { 1: 'CARROS', 2: 'MOTOS', 3: 'CAMINHÕES', 4: 'MAQUINÁRIOS', 5: 'DIVERSOS' };
        const name = catNames[catId] || `CAT_${catId}`;
        console.log(`🔍 [${SITE}] Pesquisando categoria: ${name}...`);

        try {
            const url = `${BASE_URL}/site/camada_ajax/coluna_esquerda_m.php?quebra=${Math.random()}&&opcao=listar_lote&categoria_pesquisa=${catId}&tipo_exibicao=grid&paginacao=-1`;

            const { data } = await axios.post(url,
                `opcao=listar_lote&categoria_pesquisa=${catId}&tipo_exibicao=grid&paginacao=-1`,
                {
                    headers: {
                        'Content-Type': 'application/x-www-form-urlencoded',
                        'User-Agent': getRandomUserAgent(),
                        'Referer': BASE_URL,
                        'X-Requested-With': 'XMLHttpRequest'
                    },
                    timeout: 30000
                });

            const $ = cheerio.load(data);
            const items = [];

            $('div.col-md-3').each((index, el) => {
                try {
                    const onclickEl = $(el).find('[onclick*="exibir_lote"]');
                    const onclick = onclickEl.attr('onclick') || '';
                    const match = onclick.match(/exibir_lote\((\d+),(\d+)\)/);
                    if (!match) return;

                    const registroLote = match[1];
                    const leilaoId = match[2];

                    const veiculo = $(el).find('.quebraln').text().replace(/\s+/g, ' ').trim().toUpperCase();
                    const anoFull = $(el).find('.my-0.h6').text().trim();
                    const descricao = $(el).find('.mt-0.small.mb-2').text().trim();
                    const valueStr = $(el).find('.h3').text().replace(/[^0-9,]/g, '').replace(',', '.');

                    let tipo = 'veiculo';
                    if (catId == 5) tipo = 'diversos';

                    // Parse details
                    const details = parseVehicleDetails(veiculo + ' ' + (descricao || ''));

                    // Attachments
                    const anexos = [];
                    $(el).find('a[href*=".pdf"]').each((i, a) => {
                        const href = $(a).attr('href');
                        const text = $(a).text().trim() || 'Documento';
                        if (href) anexos.push({ name: text, url: href.startsWith('http') ? href : `${BASE_URL}${href}` });
                    });

                    const item = {
                        registro: `${leilaoId}_${registroLote}`,
                        veiculo,
                        ano: details.ano || (anoFull ? anoFull.split(' ')[0] : null),
                        descricao,
                        link: `${BASE_URL}/site/?opcao=exibir_lote&id_lote=${registroLote}&id_leilao=${leilaoId}`,
                        valor: parseFloat(valueStr) || 0,
                        previsao: '',
                        localLeilao: '',
                        condicao: details.condicao || 'Conservado',
                        fotos: [],
                        tipo: classifyVehicle(veiculo + ' ' + (descricao || '')),
                        combustivel: details.combustivel,
                        cor: details.cor,
                        km: details.km,
                        cambio: details.cambio,
                        chave: details.chave,
                        blindado: details.blindado,

                        // NINJA ELITE
                        localColisao: details.localColisao,
                        origem: details.origem,
                        comitente: details.comitente || '',
                        debitoResponsabilidade: details.debitoResponsabilidade,
                        remarcado: details.remarcado,
                        anexos: anexos,

                        situacaoRaw: 'Disponível'
                    };

                    // Check if it's explicitly closed in descriptions
                    if ($(el).find('.lote-encerrado, .badge-danger').length > 0 || descricao.includes('ENCERRADO')) {
                        item.situacaoRaw = 'Encerrado';
                    }

                    $(el).find('.inf').each((i, inf) => {
                        const t = $(inf).text();
                        if (t.includes('Leil')) item.localLeilao = $(inf).find('.float-right').text().trim();
                        if (t.match(/\d{2}\/\d{2}\/\d{2}/)) {
                            item.previsao = t.trim().match(/\d{2}\/\d{2}\/\d{2}/)?.[0] || '';
                        }
                    });

                    const img = $(el).find('img.i-p-l');
                    let foto = img.attr('src');
                    if (foto) {
                        // Ensure no double /site/ if the path already starts with it or is relative
                        if (foto.startsWith('http')) {
                            item.fotos = [foto];
                        } else {
                            const cleanFoto = foto.startsWith('/') ? foto : `/${foto}`;
                            item.fotos = [`${BASE_URL}${cleanFoto.startsWith('/site/') ? '' : '/site'}${cleanFoto}`];
                        }
                    }

                    // FILTER: Only include if has photos
                    if (item.fotos && item.fotos.length > 0) {
                        items.push(dadosItem(item));
                    }
                } catch (e) { }
            });

            console.log(`✅ [${SITE}] Categoria ${name}: ${items.length} itens (filtrados c/ foto).`);
            return items;
        } catch (error) {
            console.error(`❌ [${SITE}] Erro na categoria ${name}:`, error.message);
            return [];
        }
    };

    const buscarESalvar = async () => {
        let totalAcumulado = [];
        const categorias = [1, 2, 3, 4, 5];

        for (const cat of categorias) {
            const items = await listarPorCategoria(cat);
            totalAcumulado = totalAcumulado.concat(items);
            await new Promise(r => setTimeout(r, 800));
        }

        console.log(`🏁 [${SITE}] TOTAL FINAL: ${totalAcumulado.length} veículos com foto.`);

        if (totalAcumulado.length > 0) {
            await salvarLista(totalAcumulado);
        }

        return totalAcumulado.length;
    };

    return { buscarESalvar, SITE };
};

export default createCrawler;

