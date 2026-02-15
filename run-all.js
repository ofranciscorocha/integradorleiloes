import connectDatabase from './src/database/db.js';
import createPalacioCrawler from './src/crawlers/palaciodosleiloes/index.js';
import createVipCrawler from './src/crawlers/vipleiloes/index.js';
import createGuarigliaCrawler from './src/crawlers/guariglialeiloes/index.js';
import createRogerioMenezesCrawler from './src/crawlers/rogeriomenezes/index.js';
import createLeiloCrawler from './src/crawlers/leilo/index.js';
import createMglCrawler from './src/crawlers/mgl/index.js';
import createPestanaCrawler from './src/crawlers/pestanaleiloes/index.js';
import { execute as executeFreitas } from './src/crawlers/freitas/index.js';
import { execute as executeSodre } from './src/crawlers/sodre/index.js';
import copart from './src/crawlers/copart/index.js';

const DELAY = 5000;

const runAll = async () => {
    console.log('🚀 Iniciando execução manual de TODOS os crawlers...');
    const db = await connectDatabase();

    try {
        // 1. Palácio
        console.log('\n--- 1. Palácio dos Leilões ---');
        try {
            const palacio = createPalacioCrawler(db);
            await palacio.buscarESalvar();
        } catch (e) {
            console.error('❌ Erro Palácio:', e.message);
        }

        // 2. VIP
        console.log('\n--- 2. VIP Leilões ---');
        try {
            const vip = createVipCrawler(db);
            await vip.buscarTodasPaginas(DELAY);
        } catch (e) {
            console.error('❌ Erro VIP:', e.message);
        }

        // 3. MGL
        console.log('\n--- 3. MGL Leilões ---');
        try {
            const mgl = createMglCrawler(db);
            await mgl.buscarTodos();
        } catch (e) {
            console.error('❌ Erro MGL:', e.message);
        }

        // 4. Pestana
        console.log('\n--- 4. Pestana Leilões ---');
        try {
            const pestana = createPestanaCrawler(db);
            await pestana.buscarTodos();
        } catch (e) {
            console.error('❌ Erro Pestana:', e.message);
        }

        // 5. Freitas
        console.log('\n--- 5. Freitas Leiloeiro ---');
        try {
            await executeFreitas(db);
        } catch (e) {
            console.error('❌ Erro Freitas:', e.message);
        }

        // 6. Guariglia
        console.log('\n--- 6. Guariglia Leilões ---');
        try {
            const guariglia = createGuarigliaCrawler(db);
            await guariglia.buscarTodos();
        } catch (e) {
            console.error('❌ Erro Guariglia:', e.message);
        }

        // 7. Rogério Menezes
        console.log('\n--- 7. Rogério Menezes ---');
        try {
            const rogerio = createRogerioMenezesCrawler(db);
            await rogerio.buscarTodos();
        } catch (e) {
            console.error('❌ Erro Rogério:', e.message);
        }

        // 8. Leilo
        console.log('\n--- 8. Leilo ---');
        try {
            const leilo = createLeiloCrawler(db);
            await leilo.buscarTodos();
        } catch (e) {
            console.error('❌ Erro Leilo:', e.message);
        }

        // 9. Sodré
        console.log('\n--- 9. Sodré Santoro ---');
        try {
            await executeSodre(db);
        } catch (e) {
            console.error('❌ Erro Sodré:', e.message);
        }

        // 10. Copart
        console.log('\n--- 10. Copart ---');
        try {
            await copart.buscarListaPrincipal();
        } catch (e) {
            console.error('❌ Erro Copart:', e.message);
        }

    } catch (e) {
        console.error('❌ Erro geral:', e);
    } finally {
        console.log('\n✅ Execução finalizada.');
        // await db.close();
        process.exit(0);
    }
};

runAll();
