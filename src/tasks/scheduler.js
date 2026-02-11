import cron from 'node-cron';
import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import cleanExpired from './cleanExpired.js';
import checkAlerts from './checkAlerts.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const runCrawler = (scriptPath, name) => {
    console.log(`⏰ [Scheduler] Starting ${name}...`);
    const child = spawn('node', [scriptPath], {
        stdio: 'inherit',
        shell: true
    });

    child.on('close', (code) => {
        console.log(`⏰ [Scheduler] ${name} finished with code ${code}`);
    });
};

const initScheduler = (runImmediate = false) => {
    console.log('📅 Scheduler initialized (Twice Daily: 09:00 & 16:00)');

    if (runImmediate) {
        console.log('🚀 [Scheduler] Iniciando coleta TOTAL (Startup)...');
        // Ordenação prioritária solicitada pelo usuário
        runCrawler(path.join(__dirname, '../crawlers/palaciodosleiloes/run.js'), 'Palácio dos Leilões');
        runCrawler(path.join(__dirname, '../crawlers/freitas/run.js'), 'Freitas Leiloeiro');
        runCrawler(path.join(__dirname, '../crawlers/rogeriomenezes/run.js'), 'Rogério Menezes');
        runCrawler(path.join(__dirname, '../crawlers/sodre/run.js'), 'Sodré Santoro');

        // Outros
        runCrawler(path.join(__dirname, '../crawlers/parque/run.js'), 'Parque dos Leilões');
        runCrawler(path.join(__dirname, '../crawlers/guariglialeiloes/run.js'), 'Guariglia Leilões');

        // Menor prioridade / Problemáticos
        runCrawler(path.join(__dirname, '../crawlers/vipleiloes/run.js'), 'Vip Leilões');
        // Copart (se houver no futuro)
    }

    // Schedule 1: 08:00 AM (Manhã)
    cron.schedule('0 8 * * *', () => {
        console.log('⏰ [Scheduler] Running Morning Cycle (08:00)');
        runCrawler(path.join(__dirname, '../crawlers/palaciodosleiloes/run.js'), 'Palácio dos Leilões');
        runCrawler(path.join(__dirname, '../crawlers/freitas/run.js'), 'Freitas Leiloeiro');
        runCrawler(path.join(__dirname, '../crawlers/rogeriomenezes/run.js'), 'Rogério Menezes');
        runCrawler(path.join(__dirname, '../crawlers/sodre/run.js'), 'Sodré Santoro');

        // Outros
        runCrawler(path.join(__dirname, '../crawlers/parque/run.js'), 'Parque dos Leilões');
        runCrawler(path.join(__dirname, '../crawlers/guariglialeiloes/run.js'), 'Guariglia Leilões');
        runCrawler(path.join(__dirname, '../crawlers/vipleiloes/run.js'), 'Vip Leilões');
    });

    // Schedule 2: 18:00 PM (Tarde/Noite)
    cron.schedule('0 18 * * *', () => {
        console.log('⏰ [Scheduler] Running Evening Cycle (18:00)');
        runCrawler(path.join(__dirname, '../crawlers/palaciodosleiloes/run.js'), 'Palácio dos Leilões');
        runCrawler(path.join(__dirname, '../crawlers/freitas/run.js'), 'Freitas Leiloeiro');
        runCrawler(path.join(__dirname, '../crawlers/rogeriomenezes/run.js'), 'Rogério Menezes');
        runCrawler(path.join(__dirname, '../crawlers/sodre/run.js'), 'Sodré Santoro');

        // Outros
        runCrawler(path.join(__dirname, '../crawlers/parque/run.js'), 'Parque dos Leilões');
        runCrawler(path.join(__dirname, '../crawlers/guariglialeiloes/run.js'), 'Guariglia Leilões');
        runCrawler(path.join(__dirname, '../crawlers/vipleiloes/run.js'), 'Vip Leilões');

        // Limpeza diária
        cleanExpired();
    });

    // Run cleanup and alerts every hour
    cron.schedule('0 * * * *', async () => {
        await cleanExpired();
        await checkAlerts();
    });
};


export default initScheduler;
