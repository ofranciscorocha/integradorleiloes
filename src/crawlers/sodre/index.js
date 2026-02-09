import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import connectDatabase from '../../database/db.js';

puppeteer.use(StealthPlugin());

let db;

export const execute = async (database) => {
    db = database;
    console.log('--- Iniciando Crawler Sodré Santoro (Interceptor) ---');

    const browser = await puppeteer.launch({
        headless: "new",
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--window-size=1920,1080'
        ]
    });

    let capturados = 0;

    try {
        const page = await browser.newPage();

        // Intercepta requests de API
        page.on('response', async response => {
            const url = response.url();
            const type = response.headers()['content-type'] || '';

            // Tenta pegar JSONs que pareçam conter dados de veículos
            if (type.includes('application/json') && (url.includes('api') || url.includes('lote') || url.includes('veiculo'))) {
                try {
                    const data = await response.json();

                    // Identifica se é uma lista de veículos
                    // A estrutura varia, então tenta achar array
                    let lista = [];
                    if (Array.isArray(data)) lista = data;
                    else if (data.data && Array.isArray(data.data)) lista = data.data;
                    else if (data.items && Array.isArray(data.items)) lista = data.items;
                    else if (data.lotes && Array.isArray(data.lotes)) lista = data.lotes;

                    if (lista.length > 0 && (lista[0].lote || lista[0].marca || lista[0].modelo || lista[0].id)) {
                        console.log(`Interceptado JSON com ${lista.length} itens: ${url}`);
                        await processarLista(lista);
                        capturados += lista.length;
                    }
                } catch (e) {
                    // Ignora erros de parse json em responses irrelevantes
                }
            }
        });

        const url = 'https://www.sodresantoro.com.br/veiculos/lotes?sort=auction_date_init_asc'; // Busca geral
        await page.goto(url, { waitUntil: 'networkidle2', timeout: 90000 });

        // Scroll para carregar mais (infinite scroll do Sodré)
        await autoScroll(page);

    } catch (error) {
        console.error('Erro Sodré:', error.message);
    } finally {
        await browser.close();
        console.log(`--- Finalizado Sodré: ${capturados} itens processados ---`);
    }
};

const processarLista = async (lista) => {
    const veiculos = lista.map(item => {
        // Mapeamento genérico (precisa ajustar conforme payload real)
        const titulo = item.titulo || item.modelo || item.descricao || 'Veículo Sodré';
        const lote = item.lote || item.code || item.id || 'N/D';
        const link = item.slug ? `https://www.sodresantoro.com.br/veiculos/lotes/${item.slug}` : `https://www.sodresantoro.com.br/veiculos/lote/${lote}`;
        const img = item.cover || (item.imagens && item.imagens[0]) || '';
        const valor = item.lance_atual || item.valor_inicial || 0;

        return {
            registro: String(lote),
            site: 'sodresantoro.com.br',
            link,
            veiculo: titulo,
            fotos: img ? [img] : [],
            valorInicial: typeof valor === 'string' ? parseFloat(valor.replace(/[^0-9,.]/g, '').replace(',', '.')) : valor,
            modalidade: 'leilao',
            localLeilao: item.local || 'São Paulo',
            ano: item.ano_fabricacao ? `${item.ano_fabricacao}/${item.ano_modelo}` : null,
            previsao: { string: item.data_leilao || 'Em breve' }
        };
    });

    if (veiculos.length > 0) {
        await db.salvarLista(veiculos);
    }
};

async function autoScroll(page) {
    await page.evaluate(async () => {
        await new Promise((resolve) => {
            var totalHeight = 0;
            var distance = 300; // Scrolla de pouco em pouco
            var timer = setInterval(() => {
                var scrollHeight = document.body.scrollHeight;
                window.scrollBy(0, distance);
                totalHeight += distance;

                if (totalHeight >= scrollHeight - window.innerHeight || totalHeight > 15000) { // Limite
                    clearInterval(timer);
                    resolve();
                }
            }, 200);
        });
    });
}

// Standalone runner
if (process.argv[1].includes('sodre')) {
    (async () => {
        const conn = await connectDatabase();
        await execute(conn);
        process.exit(0);
    })();
}

export default { execute };
