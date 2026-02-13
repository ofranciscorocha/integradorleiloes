import createCrawler from './index.js';
import connectDatabase from '../../database/db.js';

(async () => {
    try {
        console.log('📂 Conectando ao Banco de Dados (MGL)...');
        const db = await connectDatabase();
        const crawler = createCrawler(db);
        await crawler.buscarTodos();
        console.log('✅ Crawler MGL finalizado.');
        await db.close();
        process.exit(0);
    } catch (e) {
        console.error('❌ Erro na execução MGL:', e.message);
        process.exit(1);
    }
})();
