import cron from 'node-cron';
import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import cleanExpired from './cleanExpired.js';
import checkAlerts from './checkAlerts.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const runCrawler = (scriptPath, name) => {
    return new Promise((resolve) => {
        console.log(`⏰ [Scheduler] Starting ${name}...`);
        const child = spawn('node', [scriptPath], {
            stdio: 'inherit',
            shell: true
        });

        child.on('close', (code) => {
            console.log(`⏰ [Scheduler] ${name} finished with code ${code}`);
            resolve(code);
        });

        child.on('error', (err) => {
            console.error(`⏰ [Scheduler] Error starting ${name}:`, err);
            resolve(1);
        });
    });
};

const runSequentially = async (crawlers) => {
    for (const { path, name } of crawlers) {
        await runCrawler(path, name);
    }
};

const initScheduler = (runImmediate = false) => {
    console.log('📅 [Scheduler] Daily Cycles: 08:00 & 18:00');

    const crawlerScripts = [
        { path: path.join(__dirname, '../crawlers/palaciodosleiloes/run.js'), name: 'Palácio dos Leilões' },
        { path: path.join(__dirname, '../crawlers/freitas/run.js'), name: 'Freitas Leiloeiro' },
        { path: path.join(__dirname, '../crawlers/rogeriomenezes/run.js'), name: 'Rogério Menezes' },
        { path: path.join(__dirname, '../crawlers/sodre/run.js'), name: 'Sodré Santoro' },
        { path: path.join(__dirname, '../crawlers/parque/run.js'), name: 'Parque dos Leilões' },
        { path: path.join(__dirname, '../crawlers/guariglialeiloes/run.js'), name: 'Guariglia Leilões' },
        { path: path.join(__dirname, '../crawlers/vipleiloes/run.js'), name: 'Vip Leilões' }
    ];

    if (runImmediate) {
        console.log('🚀 [Scheduler] Iniciando coleta TOTAL (Startup Sequencial)...');
        runSequentially(crawlerScripts);
    }

    // Schedule 1: 08:00 AM (Manhã)
    cron.schedule('0 8 * * *', async () => {
        console.log('⏰ [Scheduler] Running Morning Cycle (08:00)');
        await runSequentially(crawlerScripts);
    });

    // Schedule 2: 18:00 PM (Tarde/Noite)
    cron.schedule('0 18 * * *', async () => {
        console.log('⏰ [Scheduler] Running Evening Cycle (18:00)');
        await runSequentially(crawlerScripts);
        cleanExpired();
    });

    // Run cleanup and alerts every hour
    cron.schedule('0 * * * *', async () => {
        await cleanExpired();
        await checkAlerts();
    });
};


export default initScheduler;
