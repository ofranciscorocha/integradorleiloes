import axios from 'axios';
import * as cheerio from 'cheerio';
import dotenv from 'dotenv';

dotenv.config();

const TIMEOUT = parseInt(process.env.CRAWLER_TIMEOUT_MS) || 20000;
const DELAY = parseInt(process.env.CRAWLER_DELAY_MS) || 5000;

/**
 * Crawler do Leilo (leilo.com.br) - Nuxt.js SPA
 * Extracts embedded NUXT state data from server-rendered pages
 */
const createCrawler = (db) => {
    const { salvarLista } = db;
    const SITE = 'leilo.com.br';
    const BASE = 'https://leilo.com.br';

    const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

    /**
     * Parse __NUXT__ embedded state data from Leilo pages
     */
    const parseNuxtData = (html) => {
        // Look for window.__NUXT__ or __INITIAL_STATE__ or serialized data
        const nuxtMatch = html.match(/window\.__NUXT__\s*=\s*(\{[\s\S]*?\});?\s*<\/script>/);
        if (nuxtMatch) {
            try {
                // The NUXT data is usually a JS object, not pure JSON
                // We can try to evaluate it safely
                return JSON.parse(nuxtMatch[1]);
            } catch { /* */ }
        }
        return null;
    };

    /**
     * Busca a lista de leilões/agenda
     */
    const getLeiloesAtivos = async () => {
        console.log(`\n🔍 [${SITE}] Buscando agenda de leilões...`);

        try {
            const { data } = await axios.get(`${BASE}/agenda`, { timeout: TIMEOUT });
            const $ = cheerio.load(data);
            const leiloes = [];

            // Try to find __NUXT__ embedded data
            const nuxtData = parseNuxtData(data);
            if (nuxtData) {
                console.log(`✅ [${SITE}] Found NUXT embedded data`);
                // Parse the NUXT state for auction data
                // Structure depends on their implementation
            }

            // Fallback: parse anchor tags for auction links
            $('a[href*="/leilao/"]').each((index, el) => {
                const href = $(el).attr('href') || '';
                const text = $(el).text().trim().replace(/\s+/g, ' ');

                const idMatch = href.match(/\/leilao\/([^/]+)/);
                if (!idMatch) return;

                const id = idMatch[1];
                if (leiloes.find(l => l.id === id)) return;

                leiloes.push({
                    id,
                    titulo: text.substring(0, 100) || `Leilão ${id}`,
                    url: href.startsWith('http') ? href : `${BASE}${href}`
                });
            });

            console.log(`✅ [${SITE}] ${leiloes.length} leilões encontrados`);
            return leiloes;
        } catch (error) {
            console.error(`❌ [${SITE}] Erro ao buscar agenda:`, error.message);
            return [];
        }
    };

    /**
     * Busca lotes de veículos página por página
     * Leilo's main vehicle listing: /leilao?page=X
     */
    const buscarPaginaVeiculos = async (pagina = 1) => {
        console.log(`📄 [${SITE}] Página ${pagina}...`);

        try {
            const { data } = await axios.get(`${BASE}/leilao?page=${pagina}`, { timeout: TIMEOUT });
            const $ = cheerio.load(data);
            const lotes = [];

            // Try to extract NUXT state for lot data
            const nuxtData = parseNuxtData(data);
            if (nuxtData) {
                // Try common NUXT paths
                const state = nuxtData.data || nuxtData.state || nuxtData;
                if (Array.isArray(state)) {
                    for (const item of state) {
                        if (item.lotes && Array.isArray(item.lotes)) {
                            for (const lote of item.lotes) {
                                lotes.push(formatLote(lote));
                            }
                        }
                    }
                }
            }

            // Fallback: Look for lot cards in HTML
            if (lotes.length === 0) {
                // Parse what we can from the rendered HTML
                $('a[href*="/lote/"]').each((index, el) => {
                    const href = $(el).attr('href') || '';
                    const text = $(el).text().trim().replace(/\s+/g, ' ');

                    const idMatch = href.match(/\/lote\/(\d+)/);
                    if (!idMatch) return;

                    const img = $(el).find('img').attr('src') || $(el).parent().find('img').attr('src') || '';

                    lotes.push({
                        site: SITE,
                        link: href.startsWith('http') ? href : `${BASE}${href}`,
                        registro: { lote: idMatch[1] },
                        veiculo: text.substring(0, 150) || `Lote ${idMatch[1]}`,
                        fotos: img ? [img] : [],
                        valor: 0,
                        localLeilao: '',
                        original: { url: href, texto: text }
                    });
                });
            }

            // Check total pages
            const totalText = $('h1, h2, h3, h4').text();
            const totalMatch = totalText.match(/(\d+)\s*resultado/i);
            const total = totalMatch ? parseInt(totalMatch[1]) : 0;
            const totalPagesMatch = totalText.match(/Página\s*\d+\s*de\s*(\d+)/i);
            const totalPages = totalPagesMatch ? parseInt(totalPagesMatch[1]) : 1;

            return { lotes, total, totalPages, pagina };
        } catch (error) {
            console.error(`❌ [${SITE}] Erro na página ${pagina}:`, error.message);
            return { lotes: [], total: 0, totalPages: 0, pagina };
        }
    };

    const formatLote = (lote) => ({
        site: SITE,
        link: `${BASE}/lote/${lote.id || lote.loteId}`,
        registro: { lote: String(lote.id || lote.loteId) },
        veiculo: lote.descricao || lote.titulo || lote.modelo || 'Veículo',
        fotos: lote.fotos || (lote.foto ? [lote.foto] : []),
        valor: lote.lanceInicial || lote.valor || 0,
        ano: lote.ano || '',
        km: lote.km || 0,
        localLeilao: lote.patio || lote.local || '',
        ultimoLanceValor: lote.maiorLance || 0,
        original: lote
    });

    /**
     * Busca todos os veículos
     */
    const buscarTodos = async () => {
        let pagina = 1;
        let totalGeral = 0;
        let continuar = true;

        while (continuar) {
            const { lotes, totalPages } = await buscarPaginaVeiculos(pagina);

            if (lotes.length > 0) {
                await salvarLista(lotes);
                totalGeral += lotes.length;
                console.log(`✅ [${SITE}] Página ${pagina}: ${lotes.length} lotes`);
            }

            if (pagina >= totalPages || lotes.length === 0 || pagina >= 50) {
                continuar = false;
            } else {
                pagina++;
                await sleep(DELAY);
            }
        }

        console.log(`\n✅ [${SITE}] Total: ${totalGeral} lotes processados`);
        return totalGeral;
    };

    return {
        getLeiloesAtivos,
        buscarPaginaVeiculos,
        buscarTodos,
        SITE
    };
};

export default createCrawler;
