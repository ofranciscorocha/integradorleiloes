import createCrawler from '../crawlers/ai_crawler/index.js';
import connectDatabase from '../database/db.js';

const [, , url, name] = process.argv;

if (!url || !name) {
    console.error('Usage: node run_ai.js <URL> <NAME>');
    process.exit(1);
}

(async () => {
    try {
        console.log(`🚀 Starting AI Crawler for ${name}...`);
        const db = await connectDatabase();
        const crawler = createCrawler(db);

        const count = await crawler.crawlGeneric(url, name);

        // Output result as JSON for parent process to catch
        console.log(`{"count":${count}}`);

        process.exit(0);
    } catch (e) {
        console.error('❌ Error in AI Crawler:', e);
        process.exit(1);
    }
})();
