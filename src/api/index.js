import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import connectDatabase from '../database/db.js';

dotenv.config();

const app = express();
const PORT = process.env.API_PORT || 8181;

// Middleware
app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH']
}));
app.use(express.json());

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
            limit = 20,
            site,
            search,
            anoMin,
            anoMax
        } = req.query;

        const filtro = {};

        if (site) filtro.site = site;
        if (anoMin || anoMax) {
            filtro.ano = {};
            if (anoMin) filtro.ano.$gte = String(anoMin);
            if (anoMax) filtro.ano.$lte = String(anoMax);
        }
        if (search) {
            filtro.$or = [
                { veiculo: { $regex: search, $options: 'i' } },
                { descricao: { $regex: search, $options: 'i' } }
            ];
        }

        const result = await db.paginate({
            colecao: 'veiculos',
            filtro,
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
            veiculosGuariglia
        ] = await Promise.all([
            db.count({ colecao: 'veiculos' }),
            db.count({ colecao: 'veiculos', filtro: { site: 'palaciodosleiloes.com.br' } }),
            db.count({ colecao: 'veiculos', filtro: { site: 'vipleiloes.com.br' } }),
            db.count({ colecao: 'veiculos', filtro: { site: 'guariglialeiloes.com.br' } })
        ]);

        res.json({
            success: true,
            stats: {
                total: totalVeiculos,
                porSite: {
                    'palaciodosleiloes.com.br': veiculosPalacio,
                    'vipleiloes.com.br': veiculosVip,
                    'guariglialeiloes.com.br': veiculosGuariglia
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
            {
                id: 'palaciodosleiloes',
                name: 'Palácio dos Leilões',
                domain: 'palaciodosleiloes.com.br',
                url: 'https://www.palaciodosleiloes.com.br'
            },
            {
                id: 'vipleiloes',
                name: 'VIP Leilões',
                domain: 'vipleiloes.com.br',
                url: 'https://www.vipleiloes.com.br'
            },
            {
                id: 'guariglialeiloes',
                name: 'Guariglia Leilões',
                domain: 'guariglialeiloes.com.br',
                url: 'https://www.guariglialeiloes.com.br'
            }
        ]
    });
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
        console.log(`   GET  /veiculos/:id   - Buscar veículo por registro`);
        console.log(`   POST /list           - Buscar com filtro (compatível crawlhinho)`);
        console.log('');
    });
};

startServer();

export default app;
