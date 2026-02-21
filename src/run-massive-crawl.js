import dbInit from './database/db.js';
import vipleiloes from './crawlers/vipleiloes/index.js';
import freitas from './crawlers/freitas/index.js';
import sodre from './crawlers/sodre/index.js';
import copart from './crawlers/copart/index.js';
import palaciodosleiloes from './crawlers/palaciodosleiloes/index.js';
import mgl from './crawlers/mgl/index.js';
import rogeriomenezes from './crawlers/rogeriomenezes/index.js';
import guariglialeiloes from './crawlers/guariglialeiloes/index.js';
import joaoemilio from './crawlers/joaoemilio/index.js';
import claudiokuss from './crawlers/claudiokuss/index.js';

const runMassiveCrawl = async () => {
    console.log('💎 Starting Massive Crawler Yield Execution (Goal: 10,000+ Lots) 💎');
    const db = await dbInit();

    const crawlers = [
        { name: 'VIP Leilões', crawler: vipleiloes(db) },
        { name: 'Freitas Leiloeiro', crawler: freitas(db) },
        { name: 'Sodré Santoro', crawler: sodre(db) },
        { name: 'Copart', crawler: copart(db) },
        { name: 'Palácio dos Leilões', crawler: palaciodosleiloes(db), method: 'buscarESalvar' },
        { name: 'MGL Leilões', crawler: mgl(db) },
        { name: 'Rogério Menezes', crawler: rogeriomenezes(db) },
        { name: 'Guariglia Leilões', crawler: guariglialeiloes(db) },
        { name: 'João Emílio', crawler: joaoemilio(db) },
        { name: 'Claudio Kuss', crawler: claudiokuss(db) }
    ];

    let totalGlobal = 0;

    for (const item of crawlers) {
        console.log(`\n🚀 >>> Starting ${item.name} <<< 🚀`);
        try {
            const method = item.method || 'buscarTodos';
            const count = await item.crawler[method]();
            totalGlobal += count;
            console.log(`✅ ${item.name} completed. Yield: ${count} items.`);
        } catch (e) {
            console.error(`❌ Error in ${item.name}:`, e.message);
        }
    }

    const finalStats = await db.count({ colecao: 'veiculos' });
    console.log('\n' + '='.repeat(50));
    console.log(`🏆 MASSIVE CRAWL FINISHED!`);
    console.log(`📈 New items collected this run: ${totalGlobal}`);
    console.log(`📦 Total vehicles in database: ${finalStats}`);
    console.log('='.repeat(50));

    process.exit(0);
};

runMassiveCrawl();
