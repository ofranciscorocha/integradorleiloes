import axios from 'axios';
import * as cheerio from 'cheerio';
import dotenv from 'dotenv';

dotenv.config();

const TIMEOUT = parseInt(process.env.CRAWLER_TIMEOUT_MS) || 15000;

/**
 * Trata string de data/hora para objeto com date e timestamp
 */
const tratarDataHora = (dataHoraStr) => {
    if (!dataHoraStr) return { string: '', time: null, date: null };

    const str = dataHoraStr.trim();

    // Padrão: "DD/MM/YYYY HH:MM" ou "DD/MM/YY HH:MM" ou "DD/MM/YY"
    const match = str.match(/(\d{1,2})\/(\d{1,2})\/(\d{2,4})(?:\s*(\d{1,2}):(\d{2}))?/);

    if (match) {
        let [, dia, mes, ano, hora, minuto] = match;
        if (ano.length === 2) ano = '20' + ano;
        hora = hora || '12';
        minuto = minuto || '00';

        const date = new Date(ano, mes - 1, dia, hora, minuto);
        return {
            string: str,
            time: date.getTime(),
            date
        };
    }

    return { string: str, time: null, date: null };
};

/**
 * Crawler do Palácio dos Leilões
 */
const createCrawler = (db) => {
    const { salvarLista } = db;
    const SITE = 'palaciodosleiloes.com.br';

    /**
     * Formata dados do item para padronização
     */
    const formatarItem = (dados) => {
        const {
            registro,
            bem: veiculo,
            origem: vendedor,
            ano,
            descricao,
            local,
            previsao,
            totalVisualizacoes,
            totalLances,
            tipo,
            fotos,
            leilao
        } = dados;

        return {
            site: SITE,
            registro,
            link: `https://www.palaciodosleiloes.com.br/site/lotem.php?cl=${registro?.lote}`,
            vendedor,
            veiculo,
            ano,
            descricao,
            localLeilao: local,
            previsao,
            totalVisualizacoes,
            totalLances,
            tipo,
            fotos,
            leilaoId: leilao,
            encerrado: false,
            original: dados
        };
    };

    /**
     * Busca lista de lotes do site
     */
    const listarLotes = async () => {
        console.log(`\n🔍 [${SITE}] Buscando lotes...`);

        try {
            const { data } = await axios.postForm(
                'https://www.palaciodosleiloes.com.br/site/camada_ajax/coluna_esquerda_m.php',
                {
                    quebra: '0.6543214025681199',
                    opcao: 'listar_lote',
                    categoria_pesquisa: '1',
                    subcategoria_pesquisa: '',
                    paginacao: '-1',
                    total_paginas: '1'
                },
                { timeout: TIMEOUT }
            );

            const $ = cheerio.load(data);
            const lista = [];

            // Itera sobre cada cartão (div.col-md-3)
            $('div.col-md-3').each((index, card) => {
                // Busca o div.i-c que contém o onclick
                const icDiv = $(card).find('div.i-c[onclick]');
                const onclick = icDiv.attr('onclick');

                if (!onclick || !onclick.includes('exibir_lote')) return;

                // Extrai lote e leilão do onclick: exibir_lote(1493844,8251)
                const match = onclick.match(/exibir_lote\((\d+),(\d+)\)/);
                if (!match) return;

                const [, loteId, leilaoId] = match;

                const dado = {
                    registro: {
                        lote: Number(loteId),
                        leilao: Number(leilaoId)
                    }
                };

                // Extrai veículo do h6 (geralmente tem marca/modelo)
                const h6Elements = $(card).find('.my-0.h6, .h6');
                h6Elements.each((i, h6) => {
                    const text = $(h6).text().trim();
                    // O primeiro h6 com letras maiúsculas e "/" é geralmente o veículo
                    if (text.match(/[A-Z]{2,}/) && (text.includes('/') || text.includes(' '))) {
                        if (!dado.bem) {
                            dado.bem = text;
                        } else if (!dado.ano && text.match(/^\d{4}/)) {
                            dado.ano = text;
                        }
                    } else if (text.match(/^\d{4}/)) {
                        dado.ano = text;
                    }
                });

                // Descrição do primeiro .small (tipo de sinistro)
                const smallElements = $(card).find('.small');
                if (smallElements.length > 0) {
                    const firstSmall = $(smallElements[0]).clone();
                    firstSmall.find('.float-right').remove();
                    dado.descricao = firstSmall.text().trim();
                }

                // Extrai informações das divs .inf
                const infElements = $(card).find('.inf');
                infElements.each((i, infEl) => {
                    const $inf = $(infEl);
                    const floatRight = $inf.find('.float-right').text().trim();
                    const fullText = $inf.text().trim();
                    const labelText = fullText.replace(floatRight, '').trim();

                    if (i === 0 && !labelText.includes('Leil')) {
                        // Primeiro inf = origem (seguradora)
                        dado.origem = labelText;
                    } else if (labelText.includes('Leil')) {
                        dado.leilao = floatRight;
                    } else if (floatRight.match(/\d{2}\/\d{2}\/\d{2}/)) {
                        // Data no formato DD/MM/YY
                        dado.local = labelText;
                        dado.previsao = tratarDataHora(floatRight);
                    } else if (labelText.includes('Visualiza')) {
                        dado.totalVisualizacoes = Number(floatRight) || null;
                    } else if (labelText.includes('Lance')) {
                        dado.totalLances = Number(floatRight) || null;
                    }
                });

                // Detectar tipo de sinistro pela descrição
                if (dado.descricao) {
                    const descLower = dado.descricao.toLowerCase();
                    if (descLower.includes('colis') || descLower.includes('sinist')) {
                        dado.tipo = 'colisao';
                    } else if (descLower.includes('furto') || descLower.includes('roubo')) {
                        dado.tipo = 'roubo';
                    } else if (descLower.includes('monta')) {
                        dado.tipo = 'pequena_monta';
                    }
                }

                // Extrai imagem
                const imgSrc = icDiv.find('img').attr('src');
                if (imgSrc && !imgSrc.includes('preparacao')) {
                    dado.fotos = [`https://www.palaciodosleiloes.com.br/${imgSrc}`];
                }

                lista.push(formatarItem(dado));
            });

            console.log(`✅ [${SITE}] ${lista.length} lotes encontrados`);
            return lista;
        } catch (error) {
            console.error(`❌ [${SITE}] Erro ao buscar lotes:`, error.message);
            return [];
        }
    };

    /**
     * Busca e salva lotes
     */
    const buscarESalvar = async () => {
        const lista = await listarLotes();
        if (lista.length > 0) {
            await salvarLista(lista);
        }
        return lista.length;
    };

    return {
        listarLotes,
        buscarESalvar,
        SITE
    };
};

export default createCrawler;
