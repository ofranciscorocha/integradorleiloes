import express from 'express';
import fs from 'fs';
import cors from 'cors';
import dotenv from 'dotenv';
import connectDatabase from '../database/db.js';
import path from 'path';
import { fileURLToPath } from 'url';
import { spawn } from 'child_process';
import cleanExpired from '../tasks/cleanExpired.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config();

const app = express();
const PORT = process.env.PORT || process.env.API_PORT || 8181;

// Middleware
app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH']
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public'))); // Serve arquivos estáticos

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

// Database connection
let db = null;

// ...existing code...
import initScheduler from '../tasks/scheduler.js';

// ...existing code...

const initDatabase = async () => {
    try {
        db = await connectDatabase();
        console.log('📦 Database pronta para uso');

        // Start Scheduler after DB is ready
        initScheduler(true);

    } catch (error) {
        // ...
        console.error('❌ Falha ao conectar database:', error.message);
        // process.exit(1);
        console.warn('⚠️ Server operando sem banco de dados. Endpoints falharão, mas frontend carrega.');
    }
};

// ============ ROUTES ============

/**
 * Health check
 */
app.get('/health', (req, res) => {
    res.json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        database: db ? 'connected' : 'disconnected'
    });
});

/**
 * Upload de Branding (Logo/Hero)
 */
app.post('/admin/upload-branding', requireAuth, async (req, res) => {
    try {
        const { type, base64Data } = req.body;

        if (!['logo', 'hero'].includes(type) || !base64Data) {
            return res.status(400).json({ success: false, error: 'Dados inválidos' });
        }

        // Extrair apenas o conteúdo base64
        const base64Content = base64Data.split(';base64,').pop();
        const buffer = Buffer.from(base64Content, 'base64');

        const fileName = type === 'logo' ? 'logo.png' : 'hero-bg.jpg';
        const imgDir = path.join(__dirname, 'public', 'img');
        const filePath = path.join(imgDir, fileName);

        // Garantir que a pasta img existe
        if (!fs.existsSync(imgDir)) {
            fs.mkdirSync(imgDir, { recursive: true });
        }

        fs.writeFileSync(filePath, buffer);
        console.log(`[Admin] Branding atualizado: ${fileName}`);

        res.json({ success: true, message: 'Branding atualizado com sucesso!' });
    } catch (error) {
        console.error('Erro no upload de branding:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * Listar veículos com filtro (compatibilidade com crawlhinho original)
 */
app.post('/list', async (req, res) => {
    try {
        const { filtro = {}, colunas = {} } = req.body;
        console.log('📥 POST /list:', { filtro, colunas });

        const lista = await db.list({ colecao: 'veiculos', filtro, colunas });

        res.json({
            success: true,
            filtro,
            colunas,
            total: lista.length,
            lista
        });
    } catch (error) {
        console.error('Erro em /list:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * Buscar veículos com paginação
 */
app.get('/veiculos', async (req, res) => {
    try {
        const {
            page = 1,
            limit = 12,
            search,
            site,
            anoMin,
            anoMax,
            kmMax,
            tipo,
            uf,
            sort = 'recente'
        } = req.query;

        const query = {};

        // Search text (veiculo and descricao)
        if (search && search.trim() !== '') {
            query.$or = [
                { veiculo: { $regex: search, $options: 'i' } },
                { descricao: { $regex: search, $options: 'i' } }
            ];
        }

        // Filter by site
        if (site && site.trim() !== '') {
            query.site = { $regex: site, $options: 'i' };
        }

        // Filter by year
        if ((anoMin && anoMin !== '') || (anoMax && anoMax !== '')) {
            query.ano = {};
            if (anoMin && anoMin !== '') query.ano.$gte = parseInt(anoMin);
            if (anoMax && anoMax !== '') query.ano.$lte = parseInt(anoMax);
        }

        // Filter by KM
        if (kmMax && kmMax !== '') {
            query.km = { $lte: parseInt(kmMax) };
        }

        // Filter by Category (vehicle type tabs)
        if (tipo && tipo.trim() !== '') {
            if (tipo === 'moto') {
                query.veiculo = { $regex: 'moto|honda cg|honda cb|honda biz|honda pcx|yamaha|suzuki|kawasaki|harley|ducati|triumph|xre|bros|factor|ybr|fan|pop|xtz|tenere|nmax|crosser|trail|scooter', $options: 'i' };
            } else if (tipo === 'pesado') {
                query.veiculo = { $regex: 'caminhão|caminhao|ônibus|onibus|van|sprinter|furgão|furgao|truck|reboque|carreta|bitruck|toco|cavalo|scania|volvo fh|volvo fm|iveco|man tgx|daf|atego|axor|delivery|ford cargo', $options: 'i' };
            } else {
                query.tipo = { $regex: tipo, $options: 'i' };
            }
        }

        // Filter by State (UF)
        if (uf && uf.trim() !== '') {
            query.localLeilao = { $regex: uf, $options: 'i' };
        }

        // Sort Mapping (handle accented chars from frontend)
        let sortObj = { criadoEm: -1 };
        const sortNorm = sort.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
        if (sortNorm === 'preco_asc') sortObj = { valor: 1 };
        if (sortNorm === 'preco_desc') sortObj = { valor: -1 };
        if (sortNorm === 'ano_desc') sortObj = { ano: -1 };

        const result = await db.paginate({
            colecao: 'veiculos',
            filtro: query,
            page: parseInt(page),
            limit: parseInt(limit),
            sort: sortObj,
            interleave: (sort === 'recente' || !sort),
            shuffle: (sort === 'recente' || !sort)
        });

        res.json({ success: true, ...result });
    } catch (error) {
        console.error('Erro em /veiculos:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * Buscar veículo por registro
 */
app.get('/veiculos/:registro', async (req, res) => {
    try {
        const { registro } = req.params;
        const { site } = req.query;

        const veiculo = await db.get({
            colecao: 'veiculos',
            registro,
            site
        });

        if (!veiculo) {
            return res.status(404).json({ success: false, error: 'Veículo não encontrado' });
        }

        res.json({ success: true, veiculo });
    } catch (error) {
        console.error('Erro em /veiculos/:registro:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * Estatísticas gerais
 */
app.get('/stats', async (req, res) => {
    try {
        const [
            totalVeiculos,
            veiculosPalacio,
            veiculosVip,
            veiculosGuariglia,
            veiculosFreitas,
            veiculosSodre
        ] = await Promise.all([
            db.count({ colecao: 'veiculos' }),
            db.count({ colecao: 'veiculos', filtro: { site: 'palaciodosleiloes.com.br' } }),
            db.count({ colecao: 'veiculos', filtro: { site: 'vipleiloes.com.br' } }),
            db.count({ colecao: 'veiculos', filtro: { site: 'guariglialeiloes.com.br' } }),
            db.count({ colecao: 'veiculos', filtro: { site: { $regex: 'freitas' } } }),
            db.count({ colecao: 'veiculos', filtro: { site: { $regex: 'sodre' } } })
        ]);

        res.json({
            success: true,
            stats: {
                total: totalVeiculos,
                porSite: {
                    'palaciodosleiloes.com.br': veiculosPalacio,
                    'vipleiloes.com.br': veiculosVip,
                    'guariglialeiloes.com.br': veiculosGuariglia,
                    'freitasleiloeiro.com.br': veiculosFreitas,
                    'sodresantoro.com.br': veiculosSodre,
                    'parquedosleiloes.com.br': await db.count('veiculos', { site: 'parquedosleiloes.com.br' })
                }
            }
        });
    } catch (error) {
        console.error('Erro em /stats:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * Listar sites disponíveis
 */
app.get('/sites', (req, res) => {
    res.json({
        success: true,
        sites: [
            { id: 'palacio', name: 'Palácio dos Leilões', domain: 'palaciodosleiloes.com.br' },
            { id: 'vip', name: 'VIP Leilões', domain: 'vipleiloes.com.br' },
            { id: 'guariglia', name: 'Guariglia Leilões', domain: 'guariglialeiloes.com.br' },
            { id: 'freitas', name: 'Freitas Leiloeiro', domain: 'freitasleiloeiro.com.br' },
            { id: 'sodre', name: 'Sodré Santoro', domain: 'sodresantoro.com.br' },
            { id: 'parque', name: 'Parque dos Leilões', domain: 'parquedosleiloes.com.br' }
        ]
    });
});

/**
 * Admin: Login
 */
app.post('/admin/login', (req, res) => {
    const { user, pass } = req.body;
    // Hardcoded credentials as requested
    if (user === 'admin' && pass === 'admin') {
        res.json({ success: true, token: AUTH_TOKEN });
    } else {
        res.status(401).json({ success: false, error: 'Usuário ou senha incorretos' });
    }
});



/**
 * Admin: Verificação de Token (para frontend check)
 */
app.get('/admin/check-auth', requireAuth, (req, res) => {
    res.json({ success: true });
});

/**
 * Admin: Limpar Expirados
 */
app.post('/admin/clean', requireAuth, async (req, res) => {
    try {
        const removed = await cleanExpired();
        res.json({ success: true, removed });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

/**
 * Admin: Rodar Crawler Manualmente
 */
app.post('/admin/crawl', requireAuth, (req, res) => {
    const { site } = req.body;
    let scriptPath = '';

    // Mapeamento simples
    if (site === 'freitas') scriptPath = 'src/crawlers/freitas/run.js';
    else if (site === 'palacio') scriptPath = 'src/crawlers/palacio/run.js';
    else if (site === 'copart') scriptPath = 'src/crawlers/copart/run.js';
    else if (site === 'sodre') scriptPath = 'src/crawlers/sodre/run.js';
    else if (site === 'vip') scriptPath = 'src/crawlers/vip/run.js';
    else if (site === 'parque') scriptPath = 'src/crawlers/parque/run.js';

    if (!scriptPath) return res.status(400).json({ success: false, error: 'Site desconhecido ou inativo' });

    console.log(`🚀 Iniciando crawler manual: ${site}`);

    // Roda em background detacched
    const child = spawn('node', [scriptPath], {
        cwd: process.cwd(),
        detached: true,
        stdio: 'ignore'
    });

    child.unref();

    res.json({ success: true, message: `Crawler ${site} iniciado em background.` });
});

// ============ MOCK AUTH ROUTES ============
// Simple in-memory session for demonstration (replace with Passport/Session/JWT in production)
// Note: This is a simplified auth for the frontend prototype.

app.post('/auth/login', (req, res) => {
    // Simulating Google Login success
    // In real scenario, this would handle the Google OAuth callback
    const user = {
        name: 'Usuário Google',
        email: 'user@gmail.com',
        avatar: 'https://ui-avatars.com/api/?name=User+Google&background=random'
    };

    // Set a simple cookie (client-side capable for now) 
    // real app should use httpOnly cookies
    res.json({ success: true, user });
});

app.post('/auth/logout', (req, res) => {
    res.json({ success: true });
});

app.get('/auth/me', (req, res) => {
    // For now, client manages state via simple storage/cookie simulation
    // Ideally check server session here
    res.json({ success: true });
});

// ============ START SERVER ============

/**
 * Criar alerta de WhatsApp
 */
app.post('/alerts', async (req, res) => {
    try {
        const { veiculo, valor_max, whatsapp } = req.body;
        if (!veiculo || !whatsapp) {
            return res.status(400).json({ success: false, error: 'Dados obrigatórios ausentes' });
        }

        const alert = await db.saveAlert({
            veiculo: veiculo.trim(),
            valorMax: valor_max ? parseFloat(valor_max) : null,
            whatsapp: whatsapp.trim().replace(/\D/g, '') // Save clean number
        });

        console.log(`[Alerts] Novo alerta criado para ${whatsapp}: ${veiculo}`);
        res.json({ success: true, alert });
    } catch (e) {
        console.error('Erro ao salvar alerta:', e);
        res.status(500).json({ success: false, error: e.message });
    }
});

const startServer = async () => {
    await initDatabase();


    app.listen(PORT, '0.0.0.0', () => {
        console.log(`\n🚀 API Integrador de Leilões rodando em port ${PORT}`);
        console.log(`\n📋 Endpoints disponíveis:`);
        console.log(`   GET  /health         - Status da API`);
        console.log(`   GET  /stats          - Estatísticas gerais`);
        console.log(`   GET  /sites          - Sites disponíveis`);
        console.log(`   GET  /veiculos       - Listar veículos (com paginação)`);
        console.log(`   POST /admin/clean    - Limpar expirados`);
        console.log(`   POST /admin/crawl    - Rodar Crawler`);
        console.log('');
    });
};

startServer();

export default app;
