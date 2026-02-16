import cron from 'node-cron';
import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const LOG_FILE = path.join(__dirname, '../../crawler.log');

const CONCURRENCY = process.env.MONGODB_URI ? 2 : 1; // More concurrent on Railway, stay sequential on JSON

// Status Tracking
const schedulerStatus = {
    running: false,
    lastRun: null,
    history: [],
    crawlers: {} // Track status by name
};

export const getSchedulerStatus = () => schedulerStatus;

// Priority Ordered List of all available crawlers
const crawlerScripts = [
    { id: 'copart', site: 'copart.com.br', path: path.join(__dirname, '../crawlers/copart/run.js'), name: 'Copart' },
    { id: 'sodre', site: 'sodresantoro.com.br', path: path.join(__dirname, '../crawlers/sodre/run.js'), name: 'Sodré Santoro' },
    { id: 'vip', site: 'vipleiloes.com.br', path: path.join(__dirname, '../crawlers/vipleiloes/run.js'), name: 'Vip Leilões' },
    { id: 'palacio', site: 'palaciodosleiloes.com.br', path: path.join(__dirname, '../crawlers/palaciodosleiloes/run.js'), name: 'Palácio dos Leilões' },
    { id: 'freitas', site: 'freitasleiloeiro.com.br', path: path.join(__dirname, '../crawlers/freitas/run.js'), name: 'Freitas Leiloeiro' },
    { id: 'rogeriomenezes', site: 'rogeriomenezes.com.br', path: path.join(__dirname, '../crawlers/rogeriomenezes/run.js'), name: 'Rogério Menezes' },
    { id: 'loop', site: 'loopleiloes.com.br', path: path.join(__dirname, '../crawlers/loopleiloes/run.js'), name: 'Loop Leilões' },
    { id: 'mgl', site: 'mglleiloes.com.br', path: path.join(__dirname, '../crawlers/mgl/run.js'), name: 'MGL' },
    { id: 'patiorocha', site: 'patiorochaleiloes.com.br', path: path.join(__dirname, '../crawlers/patiorocha/run.js'), name: 'Pátio Rocha' },
    { id: 'superbid', site: 'superbid.net', path: path.join(__dirname, '../crawlers/superbid/run.js'), name: 'Superbid' },
    { id: 'guariglia', site: 'guariglialeiloes.com.br', path: path.join(__dirname, '../crawlers/guariglialeiloes/run.js'), name: 'Guariglia Leilões' },
    { id: 'parque', site: 'parquedosleiloes.com.br', path: path.join(__dirname, '../crawlers/parque/run.js'), name: 'Parque dos Leilões' },
    { id: 'leilo', site: 'leilo.com.br', path: path.join(__dirname, '../crawlers/leilo/run.js'), name: 'Leilo' },
    { id: 'pestana', site: 'pestanaleiloes.com.br', path: path.join(__dirname, '../crawlers/pestanaleiloes/run.js'), name: 'Pestana Leilões' },
    // NOTE: The following crawlers are not yet implemented (no run.js exists):
    // milan, sumareleiloes, satoleiloes, danielgarcialeiloes, joaoemilio, claudiokussleiloes
];

// Initialize crawler status map
crawlerScripts.forEach(c => {
    schedulerStatus.crawlers[c.id] = {
        name: c.name,
        status: 'idle',
        lastRun: null,
        lastCode: null
    };
});

// Helper to log to file
const logToFile = (message) => {
    const timestamp = new Date().toLocaleString('pt-BR');
    const logMessage = `\n--- [${timestamp}] ${message} ---\n`;
    try {
        fs.appendFileSync(LOG_FILE, logMessage);
        console.log(logMessage.trim());
    } catch (e) { console.error('Error writing log:', e); }
};

const runCrawler = (crawler) => {
    const { id, path: scriptPath, name } = crawler;
    return new Promise((resolve, reject) => {
        logToFile(`Starting ${name}`);
        schedulerStatus.crawlers[id].status = 'running';
        schedulerStatus.crawlers[id].lastRun = new Date();

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

        // Hard timeout: 15 minutes per crawler to prevent hanging forever
        const timeout = setTimeout(() => {
            logToFile(`⚠️ ${name} timed out after 15m. Killing process.`);
            child.kill('SIGKILL');
            resolve(1);
        }, 15 * 60 * 1000);

        child.on('close', (code) => {
            clearTimeout(timeout);
            logToFile(`${name} finished with code ${code}`);
            schedulerStatus.history.push({ name, code, time: new Date() });
            if (schedulerStatus.history.length > 30) schedulerStatus.history.shift();

            schedulerStatus.crawlers[id].status = code === 0 ? 'idle' : 'error';
            schedulerStatus.crawlers[id].lastCode = code;

            resolve(code);
        });

        child.on('error', (err) => {
            clearTimeout(timeout);
            logToFile(`${name} failed to start: ${err.message}`);
            schedulerStatus.crawlers[id].status = 'error';
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
            const promise = runCrawler(script).then(() => {
                active.delete(promise);
            });
            active.add(promise);
        }

        if (active.size > 0) {
            await Promise.race(active);
        }
    }
    schedulerStatus.running = false;
    logToFile('✅ All scheduled crawlers finished.');
};

const initScheduler = async (runImmediate = false) => {
    // Audit environment on startup
    const envCheckPath = path.join(__dirname, '../utils/env-check.js');
    if (fs.existsSync(envCheckPath)) {
        logToFile('🕵️ Running Environment Audit...');
        const audit = spawn('node', [envCheckPath], { shell: true });
        audit.stdout.on('data', (data) => logToFile(`[AUDIT] ${data.toString().trim()}`));
        audit.stderr.on('data', (data) => logToFile(`[AUDIT ERROR] ${data.toString().trim()}`));
    }

    if (runImmediate) {
        console.log('🚀 [Scheduler] Iniciando coleta TOTAL (Modo POOL Dynamic)...');
        // Run in background
        runPool(crawlerScripts, CONCURRENCY).catch(console.error);
    }

    // Schedule: every 12 hours
    cron.schedule('0 */12 * * *', async () => {
        logToFile('⏰ [Scheduler] Running Automatic Cycle');
        await runPool(crawlerScripts, CONCURRENCY);
    });

    console.log('📅 [Scheduler] Daily Cycles: Every 12h');
};

export const triggerManualRun = (siteId) => {
    const crawler = crawlerScripts.find(c => c.id === siteId);
    if (!crawler) return null;

    // We don't await this, it runs in background
    runCrawler(crawler).catch(err => logToFile(`Manual run error for ${siteId}: ${err.message}`));
    return true;
};

export default initScheduler;
export { crawlerScripts };
