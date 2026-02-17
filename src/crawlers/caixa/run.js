import connectDatabase from '../../database/db.js';
import createCrawler from './index.js';

(async () => {
    try {
        const db = await connectDatabase();
        const crawler = createCrawler(db);
        await crawler.buscarTodos();
    } catch (error) {
        console.error('Erro no crawler Caixa:', error);
    } finally {
        if (connectDatabase.close) await connectDatabase.close();
        process.exit(0);
    }
})();
