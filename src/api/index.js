import express from 'express';
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
const PORT = process.env.API_PORT || 8181;

// Middleware
app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH']
}));
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public'))); // Serve arquivos estáticos

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

const initDatabase = async () => {
    try {
        db = await connectDatabase();
        console.log('📦 Database pronta para uso');
    } catch (error) {
        console.error('❌ Falha ao conectar database:', error.message);
        process.exit(1);
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
            estado
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

        // Filter by Category
        if (tipo && tipo.trim() !== '') {
            query.tipo = { $regex: tipo, $options: 'i' };
        }

        // Filter by State
        if (estado && estado.trim() !== '') {
            query.localLeilao = { $regex: estado, $options: 'i' };
        }

        const result = await db.paginate({
            colecao: 'veiculos',
            filtro: query,
            page: parseInt(page),
            limit: parseInt(limit)
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
                    'sodresantoro.com.br': veiculosSodre
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
            { id: 'sodre', name: 'Sodré Santoro', domain: 'sodresantoro.com.br' }
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

// ============ START SERVER ============

const startServer = async () => {
    await initDatabase();

    app.listen(PORT, () => {
        console.log(`\n🚀 API Integrador de Leilões rodando em http://localhost:${PORT}`);
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
