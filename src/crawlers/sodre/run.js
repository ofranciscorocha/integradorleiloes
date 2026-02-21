
import createCrawler from './index.js';
import connectDatabase from '../../database/db.js';

const run = async () => {
    try {
        console.log('🚀 Iniciando crawler Sodré Santoro (Turbo API Mode)...\n');
        const db = await connectDatabase();
        const crawler = createCrawler(db);
        await crawler.buscarTodos();
        await db.close();
        process.exit(0);
    } catch (error) {
        console.error('❌ Erro fatal no crawler Sodré Santoro:', error);
        process.exit(1);
    }
};

run();
