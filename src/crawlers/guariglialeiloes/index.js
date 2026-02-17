import axios from 'axios';
import * as cheerio from 'cheerio';
import dotenv from 'dotenv';
import moment from 'moment';

dotenv.config();

const SITE = 'guariglialeiloes.com.br';
const BASE_URL = 'https://www.guariglialeiloes.com.br';

const trataDataHora = (dataStr) => {
    if (!dataStr) return { string: '', time: null, date: null };
    try {
        const match = dataStr.match(/(\d{1,2})\/(\d{1,2})\/(\d{2,4}).*?(\d{1,2})h(\d{2})/);
        if (match) {
            let [, dia, mes, ano, hora, minuto] = match;
            if (ano.length === 2) ano = '20' + ano;
            const date = new Date(ano, mes - 1, dia, hora, minuto);
            return { string: dataStr, time: date.getTime(), date };
        }
    } catch (e) { }
    return { string: dataStr, time: null, date: null };
};

const createCrawler = (db) => {
    const { salvarLista } = db;

    const getHtml = async (url) => {
        try {
            const { data } = await axios.get(url, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8',
                    'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7',
                    'Referer': BASE_URL
                },
                timeout: 30000
            });
            return data;
        } catch (e) {
            console.error(`❌ [${SITE}] Erro request ${url}: ${e.message}`);
            return null;
        }
    };

    const buscarTodos = async () => {
        console.log(`🚀 [${SITE}] SUPERCRAWLER AXIOS: Iniciando coleta...`);
        let totalColetado = 0;

        // 1. Get Home to finding auctions
        const homeHtml = await getHtml(BASE_URL);
        if (!homeHtml) return;

        const $home = cheerio.load(homeHtml);
        const leiloes = [];

        $home('div.card-body.d-flex.flex-column').each((i, el) => {
            const linkEl = $home(el).find('div.descricao-leilao a');
            const href = linkEl.attr('href');
            if (href && href.includes('/leilao/')) {
                leiloes.push({
                    url: href.startsWith('http') ? href : `${BASE_URL}${href}`,
                    titulo: $home(el).find('div.titulo-leilao').text().trim(),
                    dataHoraRaw: $home(el).find('div.descricao-leilao strong').text().trim()
                });
            }
        });

        console.log(`   📊 [${SITE}] Encontrados ${leiloes.length} leilões ativos.`);

        for (const leilao of leiloes) {
            console.log(`   🔄 [${SITE}] Processando: ${leilao.titulo}`);
            const dataHora = trataDataHora(leilao.dataHoraRaw);
            let pagina = 1;
            let hasMore = true;

            while (hasMore && pagina <= 30) {
                const pageUrl = `${leilao.url}?page=${pagina}`;
                // console.log(`      📄 Baixando pág ${pagina}...`);

                const pageHtml = await getHtml(pageUrl);
                if (!pageHtml) { hasMore = false; break; }

                const $ = cheerio.load(pageHtml);
                const items = [];

                $('div.lote.rounded').each((i, el) => {
                    try {
                        const infoDiv = $(el).find('div.col-lg-7 div.body-lote');
                        const linkEl = infoDiv.find('a');
                        if (!linkEl.length) return;

                        const urlLote = linkEl.attr('href');
                        const link = urlLote.startsWith('http') ? urlLote : `${BASE_URL}${urlLote}`;
                        const registro = link.split('/').filter(Boolean).pop();

                        const textoCompleto = infoDiv.text();
                        const linhas = textoCompleto.split('\n').map(l => l.trim()).filter(Boolean);

                        // Extract Vehicle Name
                        let veiculo = 'VEÍCULO';
                        const linhaMarca = linhas.find(l => /marca\s*\/?\s*modelo/i.test(l));
                        if (linhaMarca) {
                            veiculo = linhaMarca.replace(/marca\s*\/?\s*modelo\s*:?\s*/gi, '').trim();
                            if (!veiculo && linhaMarca.includes(':')) veiculo = linhaMarca.split(':').slice(1).join(':').trim();
                        }
                        if (!veiculo || veiculo === 'VEÍCULO' || veiculo.length < 2) {
                            veiculo = linhas[0] || 'VEÍCULO';
                            veiculo = veiculo.replace(/marca\s*\/?\s*modelo\s*:?\s*/gi, '').trim();
                        }

                        // Extract Year
                        let ano = null;
                        const anoLine = linhas.find(l => l.includes('Ano'));
                        if (anoLine) ano = parseInt(anoLine.split(':')[1]) || null;

                        // Extract Price
                        const lanceDiv = $(el).find('div.col-lg-3 div.lance-lote');
                        const valorStr = lanceDiv.text().replace(/[^0-9,]/g, '').replace(',', '.');
                        const valor = parseFloat(valorStr) || 0;

                        // Extract Photos including Lazy Load
                        const fotos = [];
                        const imgEl = $(el).find('img');
                        let src = imgEl.attr('src') || imgEl.attr('data-src');
                        if (src) {
                            if (!src.startsWith('http')) src = `${BASE_URL}${src}`;
                            fotos.push(src);
                        }

                        // Category Logic
                        let tipo = 'veiculo';
                        const vUpper = veiculo.toUpperCase();
                        if (vUpper.includes('CASA') || vUpper.includes('APARTAMENTO') || vUpper.includes('TERRENO') || vUpper.includes('IMÓVEL') || vUpper.includes('IMOVEL') || vUpper.includes('GALPÃO') || vUpper.includes('SÍTIO') || vUpper.includes('CHÁCARA')) {
                            tipo = 'imovel';
                        } else if (vUpper.includes('SUCATA') || vUpper.includes('PEÇAS') || vUpper.includes('DIVERSOS') || vUpper.includes('LOTE') || vUpper.includes('MÓVEIS') || vUpper.includes('ELETRO')) {
                            tipo = 'diversos';
                        }

                        items.push({
                            site: SITE,
                            registro,
                            link,
                            veiculo: veiculo.toUpperCase(),
                            ano,
                            valor,
                            previsao: dataHora.string,
                            modalidade: 'leilao',
                            tipo,
                            fotos,
                            localLeilao: 'Guariglia/SP' // Default or extract if avail
                        });

                    } catch (e) { }
                });

                if (items.length > 0) {
                    await salvarLista(items);
                    totalColetado += items.length;
                    console.log(`      ✅ [${SITE}] Pág ${pagina}: +${items.length} itens.`);
                    pagina++;
                } else {
                    hasMore = false;
                }

                // Polite delay
                await new Promise(r => setTimeout(r, 500));
            }
        }

        console.log(`✅ [${SITE}] Finalizado! ${totalColetado} itens coletados.`);
    };

    return { buscarTodos, SITE };
};

export default createCrawler;
