import createCrawler from './index.js';
import connectDatabase from '../../database/db.js';

(async () => {
    const db = await connectDatabase();
    // Simula a função de salvar do db.js
    const mockDb = {
        salvarLista: async (lista) => {
            console.log(`💾 Simulando salvamento de ${lista.length} veículos...`);
            // Se quiser salvar de verdade:
            // for (const v of lista) await db.upsert('veiculos', v, { registro: v.registro, site: v.site });
        }
    };

    const crawler = createCrawler(mockDb);
    await crawler.buscarTodasPaginas(2); // Testa as 2 primeiras páginas
    process.exit(0);
})();
