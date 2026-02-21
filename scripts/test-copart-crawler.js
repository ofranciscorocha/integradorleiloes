import connectDatabase from '../src/database/db.js';
import createCopartCrawler from '../src/crawlers/copart/index.js';

const testCopart = async () => {
    console.log('🧪 Iniciando teste do crawler COPART...');
    const db = await connectDatabase();
    const copart = createCopartCrawler(db);

    try {
        // Run only for one category to see if it works
        const count = await copart.buscarTodos();
        console.log(`📊 Teste finalizado. Capturados: ${count}`);
    } catch (e) {
        console.error('❌ Erro no teste Copart:', e);
    } finally {
        process.exit(0);
    }
};

testCopart();
