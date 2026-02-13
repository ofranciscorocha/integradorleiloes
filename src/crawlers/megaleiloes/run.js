import connectDatabase from '../../database/db.js';
import createCrawler from './index.js';

const run = async () => {
    try {
        console.log('🚀 Iniciando SuperCrawler Mega Leilões...\n');
        const db = await connectDatabase();
        const crawler = createCrawler(db);
        const total = await crawler.buscarTodos();
        console.log(`\n✅ Mega Leilões finalizado! ${total} veículos.`);
        await db.close();
        process.exit(0);
    } catch (error) {
        console.error('❌ Erro:', error);
        process.exit(1);
    }
};

run();
