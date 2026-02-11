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
        console.log('🚀 [Scheduler] Iniciando coleta imediata (Startup)...');
        // Rodar alguns crawlers principais para popular o banco rápido
        runCrawler(path.join(__dirname, '../crawlers/sodre/run.js'), 'Sodré Santoro');
        runCrawler(path.join(__dirname, '../crawlers/vipleiloes/run.js'), 'Vip Leilões');
        runCrawler(path.join(__dirname, '../crawlers/parque/run.js'), 'Parque dos Leilões');
    }

    // Schedule 1: 09:00 AM
    cron.schedule('0 9 * * *', () => {
        console.log('⏰ [Scheduler] Running Morning Cycle');
        runCrawler(path.join(__dirname, '../crawlers/sodre/run.js'), 'Sodré Santoro');
        runCrawler(path.join(__dirname, '../crawlers/rogeriomenezes/index.js'), 'Rogério Menezes');
        runCrawler(path.join(__dirname, '../crawlers/parque/run.js'), 'Parque dos Leilões');
        // Add others here
    });

    // Schedule 2: 16:00 PM
    cron.schedule('0 16 * * *', () => {
        console.log('⏰ [Scheduler] Running Afternoon Cycle');
        runCrawler(path.join(__dirname, '../crawlers/sodre/run.js'), 'Sodré Santoro');
        runCrawler(path.join(__dirname, '../crawlers/rogeriomenezes/index.js'), 'Rogério Menezes');
        runCrawler(path.join(__dirname, '../crawlers/parque/run.js'), 'Parque dos Leilões');
        // Add others here

        // Also run cleanup in afternoon
        cleanExpired();
    });

    // Run cleanup and alerts every hour
    cron.schedule('0 * * * *', async () => {
        await cleanExpired();
        await checkAlerts();
    });
};


export default initScheduler;
