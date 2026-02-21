import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import connectDatabase from './database/db.js';
import createAiCrawler from './crawlers/ai_crawler/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const LEILOEIROS_FILE = path.join(__dirname, '../data/leiloeiros_extracted.json');

async function startExpansionCrawl() {
    console.log('🚀 [Expansion-Scheduler] Iniciando Varredura Nacional...');

    if (!fs.existsSync(LEILOEIROS_FILE)) {
        console.error('❌ Base de leiloeiros não encontrada.');
        return;
    }

    const leiloeiros = JSON.parse(fs.readFileSync(LEILOEIROS_FILE, 'utf-8'));
    console.log(`📦 Carregados ${leiloeiros.length} sites para análise.`);

    const db = await connectDatabase();
    const aiCrawler = createAiCrawler(db);

    // Configurações de Batch
    const BATCH_SIZE = 5; // Processar 5 sites simultaneamente
    const INTER_BATCH_DELAY = 10000; // 10 segundos entre batches

    for (let i = 0; i < leiloeiros.length; i += BATCH_SIZE) {
        const batch = leiloeiros.slice(i, i + BATCH_SIZE);
        console.log(`\n🔄 [Batch] Processando sites ${i + 1} a ${Math.min(i + BATCH_SIZE, leiloeiros.length)}...`);

        const promises = batch.map(async (item) => {
            try {
                // Tentar encontrar a página de estoque/veículos se possível, ou usar a home
                // Heurística simples: Muitos sites usam /veiculos ou /estoque
                const results = await aiCrawler.crawlGeneric(item.site, item.domain);
                console.log(`✅ [${item.domain}] Finalizado. Achados: ${results}`);
            } catch (err) {
                console.error(`❌ [${item.domain}] Erro fatal:`, err.message);
            }
        });

        await Promise.all(promises);

        if (i + BATCH_SIZE < leiloeiros.length) {
            console.log(`⏳ Aguardando ${INTER_BATCH_DELAY / 1000}s para o próximo batch...`);
            await new Promise(r => setTimeout(r, INTER_BATCH_DELAY));
        }
    }

    console.log('\n🏁 [Expansion-Scheduler] Varredura Nacional Concluída!');
    db.close();
}

startExpansionCrawl().catch(console.error);
