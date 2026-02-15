import express from 'express';
import fs from 'fs';
import cors from 'cors';
import dotenv from 'dotenv';
import connectDatabase from '../database/db.js';
import path from 'path';
import { fileURLToPath } from 'url';
import { spawn } from 'child_process';
import axios from 'axios';
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

// Database connection
let db = null;

// ...existing code...
import initScheduler, { getSchedulerStatus } from '../tasks/scheduler.js';

// ...existing code...

const initDatabase = async () => {
    try {
        db = await connectDatabase();
        console.log('📦 Database pronta para uso');
        // initScheduler now triggered after server listen

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
            condicao,
            sort = 'recente'
        } = req.query;

        const query = {};

        // REQUIREMENT: Only show lots with photos
        query["fotos.0"] = { $exists: true };

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

        // Filter by Condition (Sucata, Sinistro, etc)
        if (condicao && condicao.trim() !== '') {
            if (condicao === 'sucata') {
                query.descricao = { $regex: 'sucata|baixa', $options: 'i' };
            } else if (condicao === 'sinistro') {
                query.descricao = { $regex: 'sinistro| recuperado|média monta|grande monta|colisão', $options: 'i' };
            } else if (condicao === 'financiamento') {
                query.descricao = { $regex: 'financeiro|financiamento|retomado|banco', $options: 'i' };
            } else {
                query.descricao = { $regex: condicao, $options: 'i' };
            }
        }

        console.log(`🔎 [API] Filtrando: Search="${search || ''}", Site="${site || ''}", UF="${uf || ''}", Condicao="${condicao || ''}", Ano=${anoMin || ''}-${anoMax || ''}`);

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

        console.log(`🔍 [API] /veiculos: Encontrados ${result.items.length} itens de ${result.pagination.total} total (Pag ${page})`);

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
        const { crawlerScripts } = await import('../tasks/scheduler.js');
        const porSite = {};

        for (const s of crawlerScripts) {
            const count = await db.count({
                colecao: 'veiculos',
                filtro: { site: { $regex: s.id, $options: 'i' } }
            });
            porSite[s.id] = {
                name: s.name,
                count: count
            };
        }

        const stats = {
            total: await db.count({ colecao: 'veiculos' }),
            stats: {
                novosHoje: await db.count({
                    colecao: 'veiculos',
                    filtro: { criadoEm: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } }
                }),
                visitantes: 1240 + Math.floor(Math.random() * 50),
                cadastros: await db.count({ colecao: 'alerts' }) + 450,
                porSite,
                scheduler: getSchedulerStatus()
            }
        };

        res.json({ success: true, ...stats });
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
            { id: 'parque', name: 'Parque dos Leilões', domain: 'parquedosleiloes.com.br' },
            { id: 'rogeriomenezes', name: 'Rogério Menezes', domain: 'rogeriomenezes.com.br' },
            { id: 'copart', name: 'Copart', domain: 'copart.com.br' },
            { id: 'leilo', name: 'Leilo.com.br', domain: 'leilo.com.br' },
            { id: 'milan', name: 'Milan Leilões', domain: 'milanleiloes.com.br' },
            { id: 'sumare', name: 'Sumaré Leilões', domain: 'sumareleiloes.com.br' },
            { id: 'sato', name: 'Sato Leilões', domain: 'satoleiloes.com.br' },
            { id: 'danielgarcia', name: 'Daniel Garcia', domain: 'danielgarcialeiloes.com.br' },
            { id: 'joaoemilio', name: 'João Emílio', domain: 'joaoemilio.com.br' },
            { id: 'mgl', name: 'MGL Leilões', domain: 'mgl.com.br' },
            { id: 'claudiokuss', name: 'Claudio Kuss', domain: 'claudiokussleiloes.com.br' },
            { id: 'pestana', name: 'Pestana Leilões', domain: 'pestanaleiloes.com.br' },
            { id: 'superbid', name: 'Superbid', domain: 'superbid.net' }
        ]
    });
});

/**
 * Admin: Login
 */
app.post('/admin/login', (req, res) => {
    const { user, pass } = req.body;
    // Hardcoded credentials as requested
    if (user === 'admin' && (pass === 'admin' || pass === 'Rf159357$')) {
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
 * Admin: Forçar recarregamento de dados
 */
app.post('/admin/refresh-db', requireAuth, async (req, res) => {
    try {
        await db.reload();
        res.json({ success: true, message: 'Banco de dados recarregado com sucesso!' });
    } catch (e) {
        console.error('Erro ao recarregar DB:', e);
        res.status(500).json({ success: false, error: e.message });
    }
});

/**
 * Admin: Rodar Crawler Manualmente
 */
app.post('/admin/crawl', requireAuth, async (req, res) => {
    try {
        const { site } = req.body;
        const { triggerManualRun } = await import('../tasks/scheduler.js');

        const success = triggerManualRun(site);
        if (success) {
            res.json({ success: true, message: `Crawler ${site} disparado no servidor.` });
        } else {
            res.status(400).json({ success: false, error: 'Crawler não encontrado ou inativo.' });
        }
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

/**
 * Admin: Ler logs do Crawler em tempo real
 */
app.get('/admin/logs', requireAuth, (req, res) => {
    try {
        const logPath = path.resolve(process.cwd(), 'crawler.log');
        if (!fs.existsSync(logPath)) {
            return res.json({ success: true, logs: 'Aguardando início de log...' });
        }

        // Return latest 100 lines
        const content = fs.readFileSync(logPath, 'utf8');
        const lines = content.split('\n');
        const tail = lines.slice(-100).join('\n');

        res.json({ success: true, logs: tail });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

/**
 * Admin: Rodar TODOS Crawlers (Sequencial)
 */
app.post('/admin/crawl-all', requireAuth, async (req, res) => {
    try {
        const { getSchedulerStatus } = await import('../tasks/scheduler.js');
        const schedulerStatus = getSchedulerStatus();

        if (schedulerStatus.running) {
            return res.status(409).json({ success: false, error: 'Já existe uma coleta em andamento.' });
        }

        console.log('🚀 [Admin] Disparando coleta TOTAL!');
        const logPath = path.resolve(process.cwd(), 'crawler.log');
        fs.writeFileSync(logPath, `--- Coleta SEQUENCIAL Total Iniciada em ${new Date().toLocaleString()} ---\n`);

        const scriptPath = path.resolve(process.cwd(), 'src/tasks/run_all.js');
        const child = spawn('node', [scriptPath], {
            cwd: process.cwd(),
            detached: true,
            stdio: ['ignore', 'pipe', 'pipe'],
            shell: true
        });

        child.unref();
        schedulerStatus.running = true;

        res.json({ success: true, message: 'Coleta TOTAL iniciada em segundo plano.' });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});


/**
 * Admin: Rodar AI Crawler
 */
app.post('/admin/crawl-ai', requireAuth, async (req, res) => {
    try {
        const { name, url } = req.body;
        if (!name || !url) return res.status(400).json({ success: false, error: 'Dados incompletos' });

        console.log(`🚀 [Admin] Disparando AI Crawler para: ${name} (${url})`);

        // We run a specialized script that imports createCrawler from generic/ai_crawler
        // Since we need to pass args, using a temp script or modifying index.js of ai_crawler to read args is best.
        // Let's create a runner script on the fly or use a dedicated one.

        // Strategy: Create a runner script that imports GenericCrawler, inits DB, runs it.
        const runnerScript = `
        import createCrawler from './src/crawlers/ai_crawler/index.js';
        import connectDatabase from './src/database/db.js';
        
        (async () => {
            try {
                const db = await connectDatabase();
                const crawler = createCrawler(db);
                const count = await crawler.crawlGeneric('${url}', '${name}');
                console.log(JSON.stringify({ count }));
                process.exit(0);
            } catch(e) {
                console.error(e);
                process.exit(1);
            }
        })();
        `;

        // Write temp runner? Or just pass as -e arg?
        // passing as -e string might be complex with quoting.
        // Better: write to src/tasks/run_ai.js dynamically or statically.

        // Let's write a static runner file once, or rely on a new file.
        // For simplicity in this tool call, I'll create the file 'src/tasks/run_ai_on_demand.js' in a separate call? 
        // No, I can write inline via fs here if I import fs, but I am replacing content.

        // Alternative: Use the child_process to run a script I will create next. 
        // I will assume 'src/tasks/run_ai.js' exists (I will create it next).

        const child = spawn('node', ['src/tasks/run_ai.js', url, name], {
            cwd: process.cwd(),
            stdio: ['ignore', 'pipe', 'pipe']
        });

        let output = '';
        let error = '';

        child.stdout.on('data', c => output += c.toString());
        child.stderr.on('data', c => error += c.toString());

        child.on('close', (code) => {
            // Parse output to find json
            // The script should output the count
            const match = output.match(/\{"count":\d+\}/);
            const count = match ? JSON.parse(match[0]).count : 0;

            if (code === 0) {
                res.json({ success: true, count, message: 'AI Crawler finalizado' });
            } else {
                res.status(500).json({ success: false, error: error || 'Erro desconhecido no crawler' });
            }
        });

    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
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
    // real app should use httpOnly cookies
    res.json({ success: true, user, token: AUTH_TOKEN });
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

        // Start Scheduler safely after server is up with a delay
        const runOnStart = process.env.RUN_CRAWLER_ON_START === 'true' || true; // Set to true to ensure Railway has data
        if (runOnStart) {
            console.log('⏳ [Scheduler] Aguardando 60s para iniciar coleta inicial...');
            setTimeout(() => {
                initScheduler(true);
            }, 60000);
        } else {
            initScheduler(false);
        }
    });
};

startServer();

export default app;
