import connectDatabase from '../../database/db.js';
import createCrawler from './index.js';

(async () => {
    try {
        console.log('🚀 Iniciando Crawler João Emílio...');
        const db = await connectDatabase();
        const crawler = createCrawler(db);
        await crawler.buscarTodos();
        await db.close();
        process.exit(0);
    } catch (error) {
        console.error('❌ Erro no João Emílio:', error);
        process.exit(1);
    }
})();
