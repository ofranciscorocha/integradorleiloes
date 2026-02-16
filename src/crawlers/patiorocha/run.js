import connectDatabase from '../../database/db.js';
import createCrawler from './index.js';

(async () => {
    try {
        console.log('🚀 Iniciando Crawler Pátio Rocha...');
        const db = await connectDatabase();
        const crawler = createCrawler(db);
        await crawler.buscarTodos();
        await db.close();
        process.exit(0);
    } catch (error) {
        console.error('❌ Erro no Pátio Rocha:', error);
        process.exit(1);
    }
})();
