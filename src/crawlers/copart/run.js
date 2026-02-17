import createCrawler from './index.js';
import connectDatabase from '../../database/db.js';

const run = async () => {
    try {
        const db = await connectDatabase();
        const crawler = createCrawler(db);
        await crawler.buscarTodos();
        console.log('Crawler Copart finalizado.');
        process.exit(0);
    } catch (error) {
        console.error('Erro ao executar crawler Copart:', error);
        process.exit(1);
    }
};

run();
