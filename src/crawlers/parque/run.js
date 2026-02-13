import connectDatabase from '../../database/db.js';
import createCrawler from './index.js';

console.log('🚀 Iniciando crawler do Parque dos Leilões...\n');

const run = async () => {
    try {
        const db = await connectDatabase();
        const crawler = createCrawler(db);

        const total = await crawler.buscarTodasPaginas();

        console.log(`\n✅ Crawler finalizado! ${total} lotes processados.`);
        await db.close();
        process.exit(0);
    } catch (error) {
        console.error('❌ Erro ao executar crawler:', error);
        process.exit(1);
    }
};

run();
