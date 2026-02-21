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

const SITES_FILE = path.join(__dirname, '../../data/sites.json');
const LEILOEIROS_FILE = path.join(__dirname, '../../data/leiloeiros_extracted.json');

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
    { id: 'joaoemilio', site: 'joaoemilio.com.br', path: path.join(__dirname, '../crawlers/joaoemilio/run.js'), name: 'João Emílio' },
    { id: 'caixa', site: 'venda-imoveis.caixa.gov.br', path: path.join(__dirname, '../crawlers/caixa/run.js'), name: 'Caixa Imóveis' },
];

// Load and sync with dynamic sites.json
try {
    if (fs.existsSync(SITES_FILE)) {
        const dynamicSites = JSON.parse(fs.readFileSync(SITES_FILE, 'utf8'));
        dynamicSites.forEach(site => {
            // Initialize status for all sites
            if (!schedulerStatus.crawlers[site.id]) {
                schedulerStatus.crawlers[site.id] = {
                    name: site.name,
                    status: 'idle',
                    lastRun: null,
                    lastCode: null,
                    implemented: crawlerScripts.some(c => c.id === site.id)
                };
            }
        });
    }

    // Sync with Hundreds of Extracted Auctioneers for Total Visibility
    if (fs.existsSync(LEILOEIROS_FILE)) {
        const extraction = JSON.parse(fs.readFileSync(LEILOEIROS_FILE, 'utf8'));
        extraction.forEach(item => {
            const id = item.domain.split('.')[0];
            if (!schedulerStatus.crawlers[id]) {
                schedulerStatus.crawlers[id] = {
                    name: item.company || item.auctioneer,
                    status: 'idle',
                    lastRun: null,
                    lastCode: null,
                    implemented: false
                };
            }
        });
    }
} catch (e) { console.error('Error syncing sites in scheduler:', e); }

// Initialize remaining status map for implemented scripts
crawlerScripts.forEach(c => {
    if (!schedulerStatus.crawlers[c.id]) {
        schedulerStatus.crawlers[c.id] = {
            name: c.name,
            status: 'idle',
            lastRun: null,
            lastCode: null,
            implemented: true
        };
    }
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

const AI_CRAWLER_PATH = path.join(__dirname, '../crawlers/ai_crawler/run.js');

const runCrawler = (crawler) => {
    const { id, path: scriptPath, name, url, implemented } = crawler;
    return new Promise((resolve, reject) => {
        logToFile(`Starting ${name} (${id}) - Mode: ${implemented ? 'Specialized' : 'AI-Auto'}`);

        if (!schedulerStatus.crawlers[id]) {
            schedulerStatus.crawlers[id] = { name, status: 'idle', lastRun: null, lastCode: null, implemented };
        }

        schedulerStatus.crawlers[id].status = 'running';
        schedulerStatus.crawlers[id].lastRun = new Date();

        const finalPath = implemented ? scriptPath : AI_CRAWLER_PATH;

        // Prepare environment for AI crawler
        const env = {
            ...process.env,
            FORCE_COLOR: '1',
            SITE_ID: id,
            SITE_URL: url,
            SITE_NAME: name
        };

        const child = spawn('node', [finalPath], {
            stdio: 'pipe',
            shell: true,
            env
        });

        child.stdout.on('data', (data) => {
            const output = data.toString();
            // Detect blocking
            if (output.includes('403') || output.includes('Forbidden') || output.includes('blocked') || output.includes('Access Denied')) {
                logToFile(`🚨 [${name}] POSSÍVEL BLOQUEIO DE IP DETECTADO (403/Forbidden)`);
                schedulerStatus.crawlers[id].status = 'blocked';
            }
            const prefixed = output.trim().split('\n').map(line => `[${name}] ${line}`).join('\n');
            console.log(prefixed);
            try { fs.appendFileSync(LOG_FILE, prefixed + '\n'); } catch (e) { }
        });

        child.stderr.on('data', (data) => {
            const output = data.toString();
            if (output.includes('403') || output.includes('Forbidden')) {
                schedulerStatus.crawlers[id].status = 'blocked';
            }
            console.error(`[${name} ERROR] ${output}`);
            try { fs.appendFileSync(LOG_FILE, `[${name} ERROR] ${output}\n`); } catch (e) { }
        });

        // Timeout: 15m for specialized, 5m for AI auto (faster)
        const timeoutMs = implemented ? 15 * 60 * 1000 : 5 * 60 * 1000;

        const timeout = setTimeout(() => {
            logToFile(`⚠️ ${name} timed out. Killing process.`);
            child.kill('SIGKILL');
            resolve(1);
        }, timeoutMs);

        child.on('close', (code) => {
            clearTimeout(timeout);
            logToFile(`${name} finished with code ${code}`);
            schedulerStatus.history.push({ name, code, time: new Date() });
            if (schedulerStatus.history.length > 50) schedulerStatus.history.shift();

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

const getAllCrawlers = () => {
    const list = [...crawlerScripts.map(c => ({ ...c, implemented: true }))];
    const existingIds = new Set(list.map(c => c.id));

    // Add dynamic sites
    try {
        if (fs.existsSync(SITES_FILE)) {
            const sites = JSON.parse(fs.readFileSync(SITES_FILE, 'utf8'));
            sites.forEach(s => {
                if (!existingIds.has(s.id)) {
                    list.push({ id: s.id, name: s.name, url: s.domain, implemented: false });
                    existingIds.add(s.id);
                } else {
                    // Update URL for implemented ones
                    const item = list.find(i => i.id === s.id);
                    if (item) item.url = s.domain;
                }
            });
        }
    } catch (e) { }

    // Add extracted ones
    try {
        if (fs.existsSync(LEILOEIROS_FILE)) {
            const extraction = JSON.parse(fs.readFileSync(LEILOEIROS_FILE, 'utf8'));
            extraction.forEach(item => {
                const id = item.domain.split('.')[0];
                if (!existingIds.has(id)) {
                    list.push({
                        id,
                        name: (item.empresa && item.empresa !== '-') ? item.empresa : item.leiloeiro,
                        url: item.domain,
                        implemented: false
                    });
                    existingIds.add(id);
                }
            });
        }
    } catch (e) { }

    return list;
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

    const allCrawlers = getAllCrawlers();

    // Pre-initialize status for all so they show up in admin panel immediately
    allCrawlers.forEach(c => {
        if (!schedulerStatus.crawlers[c.id]) {
            schedulerStatus.crawlers[c.id] = {
                name: c.name,
                status: 'idle',
                lastRun: null,
                lastCode: null,
                implemented: c.implemented
            };
        }
    });

    if (runImmediate) {
        console.log(`🚀 [Scheduler] Iniciando coleta NACIONAL (${allCrawlers.length} fontes)...`);
        // Run in background
        runPool(allCrawlers, CONCURRENCY).catch(console.error);
    }

    // Schedule: every 12 hours
    cron.schedule('0 */12 * * *', async () => {
        const currentList = getAllCrawlers();
        logToFile(`⏰ [Scheduler] Running Automatic Cycle (${currentList.length} targets)`);
        await runPool(currentList, CONCURRENCY);
    });

    console.log(`📅 [Scheduler] Daily Cycles: Every 12h. Targets: ${allCrawlers.length}`);
};

export const triggerManualRun = (siteId) => {
    const all = getAllCrawlers();
    const crawler = all.find(c => c.id === siteId);
    if (!crawler) return null;

    runCrawler(crawler).catch(err => logToFile(`Manual run error for ${siteId}: ${err.message}`));
    return true;
};

export default initScheduler;
export { crawlerScripts };
