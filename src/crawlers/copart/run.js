import connectDatabase from '../../database/db.js';
import createCrawler from './index.js';

(async () => {
    try {
        console.log('🚀 Iniciando crawler do Copart (API Mode)...\n');
        const db = await connectDatabase();
        const crawler = createCrawler(db);
        await crawler.buscarTodos();
        await db.close();
        process.exit(0);
    } catch (error) {
        console.error('❌ Erro fatal no crawler Copart:', error);
        process.exit(1);
    }
})();
