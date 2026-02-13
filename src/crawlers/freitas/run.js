import connectDatabase from '../../database/db.js';
import createCrawler from './index.js';

const run = async () => {
    try {
        console.log('🚀 Iniciando crawler do Freitas Leiloeiro...\n');
        const db = await connectDatabase();
        const crawler = createCrawler(db);
        await crawler.buscarTodos();
        await db.close();
        process.exit(0);
    } catch (error) {
        console.error('Erro fatal:', error);
        process.exit(1);
    }
};

run();
