import connectDatabase from '../../database/db.js';
import createCrawler from './index.js';

const run = async () => {
    try {
        console.log('🚀 Iniciando crawler Daniel Garcia...\n');
        const db = await connectDatabase();
        const crawler = createCrawler(db);
        await crawler.buscarTodos();
        process.exit(0);
    } catch (error) {
        console.error('Erro fatal:', error);
        process.exit(1);
    }
};

run();
