import connectDatabase from '../../database/db.js';
import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';

puppeteer.use(StealthPlugin());

let db;

// Inicializa conexão e chama função principal
const run = async () => {
    try {
        const connection = await connectDatabase();
        db = connection;

        console.log('--- Iniciando Crawler Copart (Stealth Mode) ---');
        await buscarListaPrincipal();

        console.log('--- Finalizado Copart ---');
        process.exit(0);
    } catch (error) {
        console.error('Erro fatal:', error);
        process.exit(1);
    }
};

const buscarListaPrincipal = async () => {
    const browser = await puppeteer.launch({
        headless: "new",
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--window-size=1920,1080',
            '--disable-blink-features=AutomationControlled' // Extra stealth
        ]
    });

    try {
        const page = await browser.newPage();
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

        // URL de busca por "todos os veículos" (query vazia)
        const url = 'https://www.copart.com.br/lotSearchResults/?free=true&query=&page=1';
        // Nota: Copart usa paginação client-side com API ou carrega HTML.
        // Se usar API interna, melhor interceptar request.

        console.log(`Navegando para: ${url}`);
        await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });

        // Espera tabela carregar
        await page.waitForSelector('#serverSideDataTable', { timeout: 30000 }).catch(() => console.log('Timeout waiting for table selector'));

        // Extrai dados da página
        const veiculos = await page.evaluate(() => {
            const items = [];
            // Seletor genérico para tr de tabelas (ajustar após debug)
            const rows = document.querySelectorAll('table#serverSideDataTable tbody tr');

            rows.forEach(row => {
                const cols = row.querySelectorAll('td');
                if (cols.length < 5) return;

                // Tenta extrair dados baseados na posição (copart muda layout, mas geralmente...)
                // Ajustar conforme HTML real
                const imgEl = row.querySelector('img');
                const linkEl = row.querySelector('a[href*="/lot/"]');

                const veiculo = {
                    site: 'copart.com.br',
                    lote: linkEl ? linkEl.innerText.trim() : '',
                    link: linkEl ? linkEl.href : '',
                    foto: imgEl ? imgEl.src : '',
                    descricao: row.innerText.split('\n')[0] || 'Veículo Copart',
                    // Outros campos...
                };
                items.push(veiculo);
            });
            return items;
        });

        console.log(`Encontrados ${veiculos.length} veículos na página 1.`);

        // Salva no banco
        if (veiculos.length > 0) {
            await db.salvarLista(veiculos.map(v => ({
                registro: v.lote,
                site: 'copart.com.br',
                link: v.link,
                veiculo: v.descricao,
                fotos: [v.foto],
                preco: 0, // Extrair depois
                modalidade: 'leilao'
            })));
        }

    } catch (error) {
        console.error('Erro no crawler:', error);
    } finally {
        await browser.close();
    }
};

// Se rodar direto
if (process.argv[1] === import.meta.url.slice(7)) {
    run();
}

export default { run, buscarListaPrincipal };
