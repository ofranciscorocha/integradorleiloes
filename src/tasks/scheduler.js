import cron from 'node-cron';
import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import cleanExpired from './cleanExpired.js';
import checkAlerts from './checkAlerts.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let schedulerStatus = {
    lastRun: null,
    nextRun: null,
    running: false,
    history: []
};

export const getSchedulerStatus = () => schedulerStatus;

const runCrawler = (scriptPath, name) => {
    return new Promise((resolve) => {
        const logFile = path.resolve(process.cwd(), 'crawler.log');
        const logStream = fs.createWriteStream(logFile, { flags: 'a' });

        const timestamp = new Date().toLocaleString();
        logStream.write(`\n--- [${timestamp}] Starting ${name} ---\n`);
        console.log(`⏰ [Scheduler] Starting ${name}...`);

        const child = spawn('node', [scriptPath], {
            stdio: ['ignore', 'pipe', 'pipe'],
            shell: true
        });

        child.stdout.on('data', (data) => {
            logStream.write(data);
            // Also log to console for Railway logs
            process.stdout.write(`[${name}] ${data}`);
        });

        child.stderr.on('data', (data) => {
            logStream.write(`ERROR: ${data}`);
            process.stderr.write(`[${name}] ERR: ${data}`);
        });

        child.on('close', (code) => {
            logStream.write(`--- [${new Date().toLocaleString()}] ${name} finished with code ${code} ---\n`);
            logStream.end();
            console.log(`⏰ [Scheduler] ${name} finished with code ${code}`);
            resolve(code);
        });

        child.on('error', (err) => {
            logStream.write(`FATAL ERROR: ${err.message}\n`);
            logStream.end();
            console.error(`⏰ [Scheduler] Error starting ${name}:`, err);
            resolve(1);
        });
    });
};

const runSequentially = async (crawlers) => {
    schedulerStatus.running = true;
    schedulerStatus.lastRun = new Date();

    for (const { path, name } of crawlers) {
        await runCrawler(path, name);
    }

    schedulerStatus.running = false;
    schedulerStatus.history.push({
        time: new Date(),
        type: 'total_cycle'
    });
    if (schedulerStatus.history.length > 10) schedulerStatus.history.shift();

    // Trigger API Refresh
    try {
        console.log('🔄 [Scheduler] Triggering API DB Refresh...');
        // We need to call the API running on localhost:8181
        // Since we are in the same process group (usually), we might not have axios imported here.
        // Let's use dynamic import or simple fetch if node version supports it, or just use child_process curl if lazy.
        // But better to add axios import.
        const { default: axios } = await import('axios');
        await axios.post('http://localhost:8181/admin/refresh-db', {}, {
            headers: { 'Authorization': 'Bearer admin-secret-token-bip-cars-2026' }
        });
        console.log('✅ [Scheduler] API DB Refreshed');
    } catch (e) {
        console.error('⚠️ [Scheduler] Failed to refresh API DB:', e.message);
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
        { path: path.join(__dirname, '../crawlers/vipleiloes/run.js'), name: 'Vip Leilões' },
        { path: path.join(__dirname, '../crawlers/leilo/run.js'), name: 'Leilo' }
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
