import cron from 'node-cron';
import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const LOG_FILE = path.join(__dirname, '../../crawler.log');

const CONCURRENCY = 4; // Number of parallel crawlers

// Status Tracking
const schedulerStatus = {
    running: false,
    lastRun: null,
    history: []
};

export const getSchedulerStatus = () => schedulerStatus;

// Helper to log to file
const logToFile = (message) => {
    const timestamp = new Date().toLocaleString('pt-BR');
    const logMessage = `\n--- [${timestamp}] ${message} ---\n`;
    try {
        fs.appendFileSync(LOG_FILE, logMessage);
        console.log(logMessage.trim());
    } catch (e) { console.error('Error writing log:', e); }
};

const runCrawler = (scriptPath, name) => {
    return new Promise((resolve, reject) => {
        logToFile(`Starting ${name}`);

        const child = spawn('node', [scriptPath], {
            stdio: 'pipe',
            shell: true,
            env: { ...process.env, FORCE_COLOR: '1' }
        });

        child.stdout.on('data', (data) => {
            const output = data.toString();
            const prefixed = output.trim().split('\n').map(line => `[${name}] ${line}`).join('\n');
            console.log(prefixed);
            try { fs.appendFileSync(LOG_FILE, prefixed + '\n'); } catch (e) { }
        });

        child.stderr.on('data', (data) => {
            const output = data.toString();
            console.error(`[${name} ERROR] ${output}`);
            try { fs.appendFileSync(LOG_FILE, `[${name} ERROR] ${output}\n`); } catch (e) { }
        });

        child.on('close', (code) => {
            logToFile(`${name} finished with code ${code}`);
            schedulerStatus.history.push({ name, code, time: new Date() });
            if (schedulerStatus.history.length > 20) schedulerStatus.history.shift();
            resolve(code);
        });

        child.on('error', (err) => {
            logToFile(`${name} failed to start: ${err.message}`);
            resolve(1);
        });
    });
};

const runPool = async (scripts, concurrency) => {
    const queue = [...scripts];
    const active = new Set();

    logToFile(`🚀 Starting Dynamic Pool (Concurrency: ${concurrency}) with ${queue.length} crawlers`);
    schedulerStatus.running = true;
    schedulerStatus.lastRun = new Date();

    while (queue.length > 0 || active.size > 0) {
        while (queue.length > 0 && active.size < concurrency) {
            const script = queue.shift();
            const promise = runCrawler(script.path, script.name).then(() => {
                active.delete(promise);
            });
            active.add(promise);
        }

        if (active.size > 0) {
            await Promise.race(active);
        }
    }
    schedulerStatus.running = false;
    logToFile('✅ All crawlers finished.');
};

const initScheduler = async (runImmediate = false) => {
    // Priority Ordered List
    const crawlerScripts = [
        { path: path.join(__dirname, '../crawlers/copart/run.js'), name: 'Copart' }, // Slowest, Start First
        { path: path.join(__dirname, '../crawlers/sodre/run.js'), name: 'Sodré Santoro' },
        { path: path.join(__dirname, '../crawlers/vipleiloes/run.js'), name: 'Vip Leilões' },
        { path: path.join(__dirname, '../crawlers/palaciodosleiloes/run.js'), name: 'Palácio dos Leilões' },
        { path: path.join(__dirname, '../crawlers/freitas/run.js'), name: 'Freitas Leiloeiro' },
        { path: path.join(__dirname, '../crawlers/rogeriomenezes/run.js'), name: 'Rogério Menezes' },
        { path: path.join(__dirname, '../crawlers/loopleiloes/run.js'), name: 'Loop Leilões' },
        { path: path.join(__dirname, '../crawlers/mgl/run.js'), name: 'MGL' },
        { path: path.join(__dirname, '../crawlers/patiorocha/run.js'), name: 'Pátio Rocha' },
        { path: path.join(__dirname, '../crawlers/superbid/run.js'), name: 'Superbid' },
        { path: path.join(__dirname, '../crawlers/megaleiloes/run.js'), name: 'Mega Leilões' },
        { path: path.join(__dirname, '../crawlers/guariglialeiloes/run.js'), name: 'Guariglia Leilões' },
        { path: path.join(__dirname, '../crawlers/parque/run.js'), name: 'Parque dos Leilões' },
        { path: path.join(__dirname, '../crawlers/leilo/run.js'), name: 'Leilo' }
    ];

    if (runImmediate) {
        console.log('🚀 [Scheduler] Iniciando coleta TOTAL (Modo POOL Dynamic)...');
        await runPool(crawlerScripts, CONCURRENCY);
    }

    // Schedule: 08:00 and 18:00
    cron.schedule('0 8 * * *', async () => {
        console.log('⏰ [Scheduler] Running Morning Cycle (08:00)');
        await runPool(crawlerScripts, CONCURRENCY);
    });

    cron.schedule('0 18 * * *', async () => {
        console.log('⏰ [Scheduler] Running Evening Cycle (18:00)');
        await runPool(crawlerScripts, CONCURRENCY);
    });

    console.log('📅 [Scheduler] Daily Cycles: 08:00 & 18:00');
};

export default initScheduler;
