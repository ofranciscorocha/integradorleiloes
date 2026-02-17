import express from 'express';
import fs from 'fs';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { spawn } from 'child_process';
import axios from 'axios';
import connectDatabase from '../database/db.js';
import cleanExpired from '../tasks/cleanExpired.js';
import initScheduler, { getSchedulerStatus } from '../tasks/scheduler.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SITES_FILE = path.join(__dirname, '../../data/sites.json');
const getDynamicSites = () => {
    try {
        if (fs.existsSync(SITES_FILE)) {
            return JSON.parse(fs.readFileSync(SITES_FILE, 'utf8'));
        }
    } catch (e) { console.error('Error reading sites.json:', e); }
    return [];
};

dotenv.config();

const app = express();
const PORT = process.env.PORT || process.env.API_PORT || 8181;

// Database connection
let db = null;

const initDatabase = async () => {
    try {
        db = await connectDatabase();
        console.log('📦 Database pronta para uso');
    } catch (error) {
        console.error('❌ Falha ao conectar database:', error.message);
        console.warn('⚠️ Server operando sem banco de dados. Endpoints falharão, mas frontend carrega.');
    }
};

// Middleware
app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH']
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public'))); // Serve arquivos estáticos

/**
 * Proxy de Imagens para evitar bloqueio 403 (CORS/Hotlink)
 */
app.get('/proxy-img', async (req, res) => {
    try {
        const { url } = req.query;
        if (!url) return res.status(400).send('URL missing');

        const response = await axios({
            url: decodeURIComponent(url),
            method: 'GET',
            responseType: 'stream',
            timeout: 10000,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Referer': new URL(url).origin
            },
            validateStatus: false
        });

        if (response.status !== 200) {
            console.error(`[Proxy] Falha ao buscar imagem (${response.status}): ${url}`);
            return res.status(response.status).send('Proxy error');
        }

        const contentType = response.headers['content-type'];
        if (contentType) res.setHeader('Content-Type', contentType);

        // Cache por 24h
        res.setHeader('Cache-Control', 'public, max-age=86400');

        response.data.pipe(res);
    } catch (error) {
        console.error('[Proxy] Erro fatal:', error.message);
        res.status(500).send('Proxy failure');
    }
});

// Debug middleware para logs no Railway
app.use((req, res, next) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
    next();
});

// Auth Middleware Simples
const AUTH_TOKEN = 'admin-secret-token-bip-cars-2026';

const requireAuth = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (token === AUTH_TOKEN) {
        next();
    } else {
        res.status(401).json({ success: false, error: 'Acesso não autorizado' });
    }
};

// Rota raiz
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Admin Route (Obscured/Protected)
app.get('/a-painel-secreto', (req, res) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.sendFile(path.join(__dirname, 'public', 'painel.html'));
});

// Redirect amigável para o admin
app.get(['/painel', '/admin.html'], (req, res) => {
    res.redirect('/a-painel-secreto');
});

// Diagnostics
app.get('/health', async (req, res) => {
    try {
        const mongoStatus = process.env.MONGODB_URI ? 'Configured' : 'NOT Configured';
        res.json({
            status: 'ok',
            database: {
                connected: !!db,
                type: process.env.MONGODB_URI ? 'MongoDB' : 'JSON',
                mongoEnv: mongoStatus
            },
            timestamp: new Date().toISOString()
        });
    } catch (e) {
        res.status(500).json({ status: 'error', message: e.message });
    }
});

// ==========================================
// AUTH ROUTES
// ==========================================

app.post('/auth/register', async (req, res) => {
    try {
        const { nome, email, senha, telefone } = req.body;
        if (!email || !senha) return res.status(400).json({ success: false, error: 'Email e senha obrigatórios' });

        const existing = await db.get({ colecao: 'users', registro: email, site: 'local' });
        if (existing) return res.status(400).json({ success: false, error: 'Email já cadastrado' });

        await db.insert({
            colecao: 'users',
            dados: {
                registro: email,
                site: 'local',
                nome,
                email,
                senha,
                telefone,
                plano: 'free',
                criadoEm: new Date()
            }
        });

        res.json({ success: true, user: { nome, email, plano: 'free' } });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

app.post('/auth/login', async (req, res) => {
    try {
        const { email, senha } = req.body;
        const user = await db.get({ colecao: 'users', registro: email, site: 'local' });

        if (email === 'admin' && senha === 'Rf159357$') {
            return res.json({ success: true, user: { nome: 'Admin', email, plano: 'admin' }, token: AUTH_TOKEN });
        }

        if (!user || user.senha !== senha) {
            return res.status(401).json({ success: false, error: 'Credenciais inválidas' });
        }

        res.json({ success: true, user: { nome: user.nome, email: user.email, plano: user.plano || 'free' }, token: AUTH_TOKEN });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

// ==========================================
// VEHICLE ROUTES
// ==========================================

app.post('/list', async (req, res) => {
    try {
        const { filtro = {}, colunas = {} } = req.body;
        const lista = await db.list({ colecao: 'veiculos', filtro, colunas });
        res.json({ success: true, total: lista.length, lista });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.get('/veiculos', async (req, res) => {
    try {
        const { page = 1, limit = 12, search, site, anoMin, anoMax, kmMax, tipo, uf, condicao, sort = 'recente' } = req.query;
        const query = { "fotos.0": { $exists: true } };

        if (search && search.trim() !== '') {
            query.$or = [{ veiculo: { $regex: search, $options: 'i' } }, { descricao: { $regex: search, $options: 'i' } }];
        }
        if (site && site.trim() !== '') query.site = { $regex: site, $options: 'i' };
        if (anoMin || anoMax) {
            query.ano = {};
            if (anoMin) query.ano.$gte = parseInt(anoMin);
            if (anoMax) query.ano.$lte = parseInt(anoMax);
        }
        if (kmMax) query.km = { $lte: parseInt(kmMax) };
        if (tipo) query.tipo = { $regex: tipo, $options: 'i' };
        if (uf) query.localLeilao = { $regex: uf, $options: 'i' };

        let sortObj = { ano: -1, criadoEm: -1 };
        if (sort.includes('preco_asc')) sortObj = { valor: 1 };
        if (sort.includes('preco_desc')) sortObj = { valor: -1 };

        const { items, pagination } = await db.paginate({
            colecao: 'veiculos',
            filtro: query,
            page: parseInt(page),
            limit: parseInt(limit),
            sort: sortObj,
            interleave: true
        });

        res.json({ success: true, items, pagination });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.get('/veiculos/:registro', async (req, res) => {
    try {
        const { registro } = req.params;
        const { site } = req.query;
        const veiculo = await db.get({ colecao: 'veiculos', registro, site });
        if (!veiculo) return res.status(404).json({ success: false, error: 'Veículo não encontrado' });
        res.json({ success: true, veiculo });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// ==========================================
// ADMIN ROUTES
// ==========================================

app.post('/admin/upload-branding', requireAuth, async (req, res) => {
    try {
        const { type, base64Data } = req.body;
        const base64Content = base64Data.split(';base64,').pop();
        const buffer = Buffer.from(base64Content, 'base64');
        const fileName = type === 'logo' ? 'logo.png' : 'hero-bg.jpg';
        const imgDir = path.join(__dirname, 'public', 'img');
        if (!fs.existsSync(imgDir)) fs.mkdirSync(imgDir, { recursive: true });
        fs.writeFileSync(path.join(imgDir, fileName), buffer);
        res.json({ success: true, message: 'Branding atualizado!' });
    } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

app.post('/admin/clear-site', requireAuth, async (req, res) => {
    try {
        const { siteId } = req.body;
        const sites = getDynamicSites();
        const site = sites.find(s => s.id === siteId);
        if (!site) return res.status(404).json({ success: false, error: 'Site not found' });
        const removed = await db.deleteBySite({ site: site.domain });
        res.json({ success: true, removed, message: `${removed} itens removidos para ${site.name}` });
    } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

app.post('/admin/add-site', requireAuth, async (req, res) => {
    try {
        const { id, name, domain } = req.body;
        const sites = getDynamicSites();
        if (sites.find(s => s.id === id)) return res.status(400).json({ success: false, error: 'ID already exists' });
        sites.push({ id, name, domain });
        fs.writeFileSync(SITES_FILE, JSON.stringify(sites, null, 2));
        res.json({ success: true, message: 'Site adicionado!' });
    } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

app.get('/stats', async (req, res) => {
    try {
        const sites = getDynamicSites();
        const porSite = {};
        for (const s of sites) {
            porSite[s.id] = { name: s.name, count: await db.count({ colecao: 'veiculos', filtro: { site: s.domain } }) };
        }
        res.json({
            success: true,
            total: await db.count({ colecao: 'veiculos' }),
            stats: { porSite, scheduler: getSchedulerStatus() }
        });
    } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

app.get('/sites', (req, res) => res.json({ success: true, sites: getDynamicSites() }));

app.get('/admin/check-auth', requireAuth, (req, res) => res.json({ success: true }));

app.post('/admin/clean', requireAuth, async (req, res) => {
    try { res.json({ success: true, removed: await cleanExpired() }); }
    catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

app.post('/admin/refresh-db', requireAuth, async (req, res) => {
    try { await db.reload(); res.json({ success: true, message: 'DB Recarregado!' }); }
    catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

app.post('/admin/crawl', requireAuth, async (req, res) => {
    try {
        const { site } = req.body;
        const { triggerManualRun } = await import('../tasks/scheduler.js');
        if (triggerManualRun(site)) res.json({ success: true });
        else res.status(400).json({ success: false, error: 'Crawler fail' });
    } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

app.get('/admin/logs', requireAuth, (req, res) => {
    const logPath = path.resolve(process.cwd(), 'crawler.log');
    if (!fs.existsSync(logPath)) return res.json({ success: true, logs: '' });
    const content = fs.readFileSync(logPath, 'utf8').split('\n').slice(-100).join('\n');
    res.json({ success: true, logs: content });
});

app.post('/admin/crawl-all', requireAuth, async (req, res) => {
    const status = getSchedulerStatus();
    if (status.running) return res.status(409).json({ success: false, error: 'Running' });
    spawn('node', ['src/tasks/run_all.js'], { detached: true, stdio: 'ignore', shell: true }).unref();
    status.running = true;
    res.json({ success: true });
});

app.post('/alerts', async (req, res) => {
    try {
        const { veiculo, whatsapp } = req.body;
        await db.saveAlert({ veiculo, whatsapp: whatsapp.replace(/\D/g, '') });
        res.json({ success: true });
    } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

const startServer = async () => {
    await initDatabase();

    const server = app.listen(PORT, '0.0.0.0', () => {
        console.log(`🚀 API rodando em ${PORT}`);
        initScheduler(process.env.RUN_CRAWLER_ON_START === 'true');
    }).on('error', (err) => {
        if (err.code === 'EADDRINUSE') {
            console.error(`❌ Porta ${PORT} em uso. Tentando fechar processos antigos...`);
            // Em ambientes locais, podemos tentar matar o processo (Windows)
            if (process.platform === 'win32') {
                spawn('taskkill', ['/F', '/IM', 'node.exe', '/FI', `WINDOWTITLE eq node  src/api/index.js`], { shell: true });
            }
            setTimeout(() => {
                console.log('🔄 Reiniciando servidor...');
                startServer();
            }, 2000);
        } else {
            console.error('❌ Erro ao iniciar servidor:', err);
        }
    });
};

startServer();
export default app;
