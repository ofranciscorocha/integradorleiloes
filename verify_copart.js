
import createCrawler from './src/crawlers/copart/index.js';

const mockDb = {
    salvarLista: async (items) => {
        console.log(`[MOCK DB] Saving ${items.length} items from ${items[0]?.site}`);
        items.forEach(i => console.log(`   - ${i.veiculo} (${i.link})`));
    }
};

(async () => {
    const crawler = createCrawler(mockDb);
    console.log('Starting Copart Crawler Verification...');
    await crawler.buscarTodos();
})();
