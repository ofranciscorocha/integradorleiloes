import createCrawler from './index.js';
import connectDatabase from '../../database/db.js';

const run = async () => {
    const siteId = process.argv[2] || process.env.SITE_ID;
    const siteUrl = process.argv[3] || process.env.SITE_URL;
    const siteName = process.argv[4] || process.env.SITE_NAME;

    if (!siteUrl) {
        console.error('❌ Erro: URL do site não fornecida.');
        process.exit(1);
    }

    console.log(`🤖 [AI-Runner] Iniciando coleta para: ${siteName || siteId} (${siteUrl})`);

    try {
        const db = await connectDatabase();
        const crawler = createCrawler(db);

        // Ensure URL has protocol
        const fullUrl = siteUrl.startsWith('http') ? siteUrl : `https://${siteUrl}`;

        const count = await crawler.crawlGeneric(fullUrl, siteName || siteId);

        console.log(`✅ [AI-Runner] Coleta finalizada. ${count} itens processados.`);
        process.exit(0);
    } catch (error) {
        console.error(`❌ [AI-Runner] Erro crítico: ${error.message}`);
        process.exit(1);
    }
};

run();
