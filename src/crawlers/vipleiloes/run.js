import connectDatabase from '../../database/db.js';
import createCrawler from './index.js';

const run = async () => {
    try {
        console.log('🚀 Iniciando crawler VIP Leilões (Turbo API Mode)...\n');
        const db = await connectDatabase();
        const crawler = createCrawler(db);
        await crawler.buscarTodasPaginas();
        await db.close();
        process.exit(0);
    } catch (error) {
        console.error('❌ Erro fatal no crawler VIP:', error);
        process.exit(1);
    }
};

run();
