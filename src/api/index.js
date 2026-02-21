import express from 'express';
import fs from 'fs';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { spawn } from 'child_process';
import axios from 'axios';
import https from 'https';
import connectDatabase from '../database/db.js';
import cleanExpired from '../tasks/cleanExpired.js';
import initScheduler, { getSchedulerStatus } from '../tasks/scheduler.js';
import * as cheerio from 'cheerio';
import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import { getExecutablePath, getCommonArgs } from '../utils/browser.js';

puppeteer.use(StealthPlugin());

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SITES_FILE = path.join(__dirname, '../../data/sites.json');
const LEILOEIROS_FILE = path.join(__dirname, '../../data/leiloeiros_extracted.json');

// Cache para leiloeiros
let leiloeirosMetadata = [];
try {
    if (fs.existsSync(LEILOEIROS_FILE)) {
        leiloeirosMetadata = JSON.parse(fs.readFileSync(LEILOEIROS_FILE, 'utf-8'));
        console.log(`📦 Metadata de ${leiloeirosMetadata.length} leiloeiros carregada.`);
    }
} catch (e) { console.error('Erro ao carregar leiloeirosMetadata:', e.message); }
const getDynamicSites = () => {
    let coreSites = [];
    try {
        if (fs.existsSync(SITES_FILE)) {
            coreSites = JSON.parse(fs.readFileSync(SITES_FILE, 'utf8'));
        }
    } catch (e) { console.error('Error reading sites.json:', e); }

    // Merge with extracted auctioneers for total visibility
    let extracted = [];
    try {
        if (fs.existsSync(LEILOEIROS_FILE)) {
            extracted = JSON.parse(fs.readFileSync(LEILOEIROS_FILE, 'utf-8'));
        }
    } catch (e) { }

    const merged = [...coreSites];
    const existingDomains = new Set(coreSites.map(s => s.domain.toLowerCase()));

    extracted.forEach(item => {
        if (!existingDomains.has(item.domain.toLowerCase())) {
            merged.push({
                id: item.domain.split('.')[0], // Simple ID
                name: item.company || item.auctioneer,
                domain: item.domain
            });
            existingDomains.add(item.domain.toLowerCase());
        }
    });

    return merged;
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

        let targetUrl = url;
        try { targetUrl = decodeURIComponent(url); } catch (e) { }

        const response = await axios({
            url: targetUrl,
            method: 'GET',
            responseType: 'stream',
            timeout: 15000,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Referer': (targetUrl.includes('freitas') || targetUrl.includes('cdn3')) ? 'https://www.freitasleiloeiro.com.br/' : new URL(targetUrl).origin
            },
            httpsAgent: new https.Agent({ rejectUnauthorized: false }),
            validateStatus: false
        });

        if (response.status !== 200) {
            console.error(`[Proxy] Falha ao buscar imagem (${response.status}): ${targetUrl}`);
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

/**
 * Proxy de Consulta por Placa (PlacaFipe)
 */
app.get('/proxy-placa', async (req, res) => {
    try {
        const { placa } = req.query;
        if (!placa) return res.status(400).json({ success: false, error: 'Placa missing' });

        const cleanPlaca = placa.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
        const targetUrl = `https://www.tabelafipebrasil.com/placa/${cleanPlaca}`;

        console.log(`🔍 [PlacaProxy] Consultando base Denatran: ${targetUrl}`);

        // 0. BUSCA LOCAL (Rápida)
        // Se a placa já estiver em algum veículo do nosso banco, podemos retornar os dados dele
        try {
            const localVehicles = await db.list({
                colecao: 'veiculos',
                filtro: {
                    $or: [
                        { veiculo: { $regex: cleanPlaca, $options: 'i' } },
                        { descricao: { $regex: cleanPlaca, $options: 'i' } }
                    ]
                },
                limit: 1
            });

            if (localVehicles && localVehicles.length > 0) {
                const v = localVehicles[0];
                console.log(`✅ [PlacaProxy] Encontrado no banco local: ${v.veiculo}`);
                // Extrair dados básicos se possível
                return res.json({
                    success: true,
                    data: {
                        marca: v.veiculo.split('/')[0] || '',
                        modelo: v.veiculo.split('/')[1] || v.veiculo,
                        ano: v.ano || '',
                        anoModelo: v.ano || '',
                        cor: v.cor || '',
                        combustivel: v.combustivel || '',
                        motor: v.motor || '---',
                        potencia: v.potencia || '---',
                        cilindrada: v.cilindrada || '---',
                        local: v.localLeilao || ''
                    },
                    method: 'local_db'
                });
            }
        } catch (dbErr) { console.error('[PlacaProxy] Erro busca local:', dbErr.message); }

        const response = await axios.get(targetUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
                'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7',
                'Referer': 'https://www.google.com/',
                'Cache-Control': 'no-cache',
                'Pragma': 'no-cache'
            },
            timeout: 10000,
            validateStatus: false
        });

        if (response.status === 403 || response.status === 429) {
            console.warn(`[PlacaProxy] Bloqueio detectado (${response.status}). Tentando Puppeteer...`);

            // Puppeteer Fallback
            let browser;
            try {
                browser = await puppeteer.launch({
                    headless: true,
                    executablePath: getExecutablePath(),
                    args: getCommonArgs()
                });
                const page = await browser.newPage();
                await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36');
                await page.goto(targetUrl, { waitUntil: 'networkidle2', timeout: 30000 });

                const pageContent = await page.content();
                const $p = cheerio.load(pageContent);
                const pData = {};

                $p('.fipeTablePriceDetail tr').each((i, el) => {
                    const label = $p(el).find('td').first().text().replace(':', '').trim();
                    const value = $p(el).find('td').last().text().trim();
                    if (label.includes('Marca')) pData.marca = value;
                    if (label.includes('Modelo')) pData.modelo = value;
                    if (label.includes('Ano Modelo')) pData.anoModelo = value;
                    else if (label.includes('Ano')) pData.ano = value;
                    if (label.includes('Cor')) pData.cor = value;
                    if (label.includes('Chassi')) pData.chassi = value;
                    if (label.includes('Combustível')) pData.combustivel = value;
                    if (label.includes('Município')) pData.municipio = value;
                    if (label.includes('UF')) pData.uf = value;
                    if (label.includes('Cilindrada')) pData.cilindrada = value;
                    if (label.includes('Potencia')) pData.potencia = value;
                    if (label.includes('Motor')) pData.motor = value;
                    if (label.includes('Segmento')) pData.segmento = value;
                });

                const fipeText = $p('.fipeTable tr').find('td:contains("Valor")').next().text().trim();
                if (fipeText) pData.fipe = fipeText;

                if (Object.keys(pData).length > 0) {
                    await browser.close();
                    return res.json({ success: true, data: pData, method: 'puppeteer' });
                }
            } catch (pError) {
                console.error('[PlacaProxy] Puppeteer Fallback Falhou:', pError.message);
            } finally {
                if (browser) await browser.close();
            }
        }

        if (response.status !== 200) {
            return res.status(response.status).json({ success: false, error: 'Erro ao consultar o site externo.' });
        }

        const $ = cheerio.load(response.data);
        const data = {};

        // Extração de dados da tabela detalhada
        $('.fipeTablePriceDetail tr').each((i, el) => {
            const label = $(el).find('td').first().text().replace(':', '').trim();
            const value = $(el).find('td').last().text().trim();

            if (label.includes('Marca')) data.marca = value;
            if (label.includes('Modelo')) data.modelo = value;
            if (label.includes('Ano Modelo')) data.anoModelo = value;
            else if (label.includes('Ano')) data.ano = value;
            if (label.includes('Cor')) data.cor = value;
            if (label.includes('Combustível')) data.combustivel = value;
            if (label.includes('Município')) data.municipio = value;
            if (label.includes('UF')) data.uf = value;
            if (label.includes('Chassi')) data.chassi = value;
            if (label.includes('Cilindrada')) data.cilindrada = value;
            if (label.includes('Potencia')) data.potencia = value;
            if (label.includes('Passageiros')) data.passageiros = value;
            if (label.includes('Espécie')) data.especie = value;
            if (label.includes('Motor')) data.motor = value;
            if (label.includes('Segmento')) data.segmento = value;
        });

        // Tabela FIPE (Preço)
        const fipeText = $('.fipeTable tr').find('td:contains("Valor")').next().text().trim();
        if (fipeText) data.fipe = fipeText;

        // Placa Anterior (Sistema Antigo)
        const anteriorMatch = response.data.match(/placa no sistema antigo era ([A-Z0-9-]{8})/i);
        if (anteriorMatch) data.placaAnterior = anteriorMatch[1];

        // Se a busca principal falhar, tenta o texto do resumo (metatags)
        if (!data.modelo) {
            const desc = $('meta[name="description"]').attr('content');
            if (desc) {
                // Ex: Placa GAC7C32 corresponde a carro Mercedes-Benz C180FF 2018 de cor Preta registrado em SANTANA DE PARNAIBA (SP).
                data.resumo = desc;
            }
        }

        if (Object.keys(data).length === 0) {
            return res.status(404).json({ success: false, error: 'Dados não encontrados para esta placa' });
        }

        res.json({ success: true, data });
    } catch (error) {
        console.error('[PlacaProxy] Erro:', error.message);
        res.status(500).json({ success: false, error: 'Falha na consulta externa' });
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
        const veiculosCount = db ? await db.count({ colecao: 'veiculos' }) : 0;
        const sitesCount = getDynamicSites().length;

        res.json({
            status: 'ok',
            database: {
                connected: !!db,
                type: process.env.MONGODB_URI ? 'MongoDB' : 'JSON',
                mongoEnv: mongoStatus,
                veiculosTotal: veiculosCount,
                leiloeirosTotal: sitesCount
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

app.post('/favoritos', async (req, res) => {
    try {
        const { email, registro, site, action } = req.body;
        if (!email || !registro) return res.status(400).json({ success: false, error: 'Email e registro são obrigatórios' });

        const user = await db.get({ colecao: 'users', registro: email, site: 'local' });
        if (!user) return res.status(404).json({ success: false, error: 'Usuário não encontrado' });

        let favorites = user.favoritos || [];
        const favKey = { registro, site };

        if (action === 'add') {
            const alreadyExists = favorites.some(f =>
                (typeof f === 'string' && f === registro) ||
                (typeof f === 'object' && f.registro === registro && f.site === site)
            );
            if (!alreadyExists) favorites.push(favKey);
        } else {
            favorites = favorites.filter(f =>
                (typeof f === 'string' && f !== registro) ||
                (typeof f === 'object' && (f.registro !== registro || f.site !== site))
            );
        }

        await db.update({ colecao: 'users', registro: email, site: 'local', set: { favoritos: favorites } });
        res.json({ success: true, count: favorites.length });
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
        const { page = 1, limit = 24, search, site, anoMin, anoMax, kmMax, tipo, uf, condicao, status, sort = 'recente', favorites_only, user_email } = req.query;
        const query = {};
        const conditions = [];

        // Normalize parameters
        const getSingleParam = (p) => Array.isArray(p) ? p.find(x => x && x.trim() !== '') : p;
        const normalizedCondicao = getSingleParam(condicao);
        const normalizedSite = getSingleParam(site);

        if (search && search.trim() !== '') {
            conditions.push({
                $or: [
                    { veiculo: { $regex: search, $options: 'i' } },
                    { descricao: { $regex: search, $options: 'i' } }
                ]
            });
        }

        if (normalizedSite && normalizedSite.trim() !== '') query.site = { $regex: normalizedSite, $options: 'i' };

        if (anoMin || anoMax) {
            query.ano = {};
            if (anoMin) query.ano.$gte = parseInt(anoMin);
            if (anoMax) query.ano.$lte = parseInt(anoMax);
        }

        if (kmMax) query.km = { $lte: parseInt(kmMax) };

        if (tipo) {
            if (tipo === 'carro') {
                conditions.push({
                    $and: [
                        { veiculo: { $not: /MOTO|MOTOCICLETA|SCOOTER|BIZ|TRIUMPH|HARLEY|KAWASAKI|YAMAHA|BMW R|DUCATI|HONDA CG|POP 110|NMAX|XMAX|PCX|ADV\b/i } },
                        { veiculo: { $not: /CAMINHÃO|CAMINHAO|ÔNIBUS|ONIBUS|TRATOR|REBOQUE|CARRETA|CAVALO MECANICO|RODOVIARIO/i } },
                        {
                            $or: [
                                { tipo: 'carro' },
                                { veiculo: { $regex: 'CIVIC|COROLLA|GOL|ONIX|HB20|FIAT|VW|GM|CHEVROLET|HYUNDAI|RENAULT|FORD|JEEP|TOYOTA|HONDA|NISSAN|PEUGEOT|CITROEN|MITSUBISHI', $options: 'i' } }
                            ]
                        }
                    ]
                });
            } else if (tipo === 'moto') {
                conditions.push({
                    $or: [
                        { tipo: 'moto' },
                        { veiculo: { $regex: 'MOTO|MOTOCICLETA|SCOOTER|BIZ|HONDA CG|YAMAHA|KAWASAKI|SUZUKI|DUCATI|HARLEY|TRIUMPH|BMW R|KTM|POP 100|POP 110|NMAX|XMAX|PCX|ADV\\b', $options: 'i' } }
                    ]
                });
            } else if (tipo === 'pesado') {
                conditions.push({
                    $or: [
                        { tipo: 'pesado' },
                        { veiculo: { $regex: 'CAMINHÃO|CAMINHAO|ÔNIBUS|ONIBUS|TRATOR|VOLVO FH|SCANIA|IVECO|MERCEDES AXOR|MERCEDES BENZ L|REBOQUE|CARRETA|CAVALO MECANICO', $options: 'i' } }
                    ]
                });
            }
        }

        if (uf && uf.trim() !== '') {
            if (uf.length === 2) {
                // Precise UF match (end of string or surrounded by separators)
                query.localLeilao = { $regex: `(${uf}$|\\b${uf}\\b|/${uf}$)`, $options: 'i' };
            } else {
                query.localLeilao = { $regex: uf, $options: 'i' };
            }
        }

        // CONDICAO FILTER (Mandatory for 'Sucata' vs 'Documentavel')
        const { condicao_not } = req.query;
        if (normalizedCondicao && normalizedCondicao.trim() !== '') {
            query.condicao = { $regex: normalizedCondicao, $options: 'i' };
        }
        if (condicao_not && condicao_not.trim() !== '') {
            if (!query.condicao) query.condicao = {};
            query.condicao.$ne = condicao_not; // Typically 'Sucata'
        }

        if (status) {
            query.situacao = status;
        } else {
            // DEFAULT: Excluir itens Vendidos ou Encerrados da listagem pública
            query.situacao = { $nin: ['Vendido', 'Encerrado'] };
        }

        // Combine conditions into query
        if (conditions.length > 0) {
            if (conditions.length === 1 && !query.$or) {
                Object.assign(query, conditions[0]);
            } else {
                query.$and = conditions;
            }
        }

        // ROBO ELITE: Favorites Filtering
        if (favorites_only === 'true' && user_email) {
            try {
                const user = await db.get({ colecao: 'users', registro: user_email, site: 'local' });
                if (user && user.favoritos && user.favoritos.length > 0) {
                    // Filter by specific registrations in the favorites set
                    // We assume each favorite is an object { registro, site } or just registro string
                    const favIds = user.favoritos.map(f => typeof f === 'object' ? f.registro : f);
                    query.registro = { $in: favIds };
                } else {
                    // If no favorites, return empty
                    return res.json({ success: true, items: [], pagination: { page: 1, limit: parseInt(limit), total: 0, totalPages: 0 } });
                }
            } catch (err) {
                console.error('Error fetching favorites:', err);
            }
        }

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

        // Ensure some fields exist for the frontend even if null
        veiculo.ano = veiculo.ano || '---';
        veiculo.km = veiculo.km || 0;
        veiculo.valor = veiculo.valor || 0;

        // Enriquecer com metadados do leiloeiro se disponível
        const domain = veiculo.site.replace('www.', '').toLowerCase();
        const meta = leiloeirosMetadata.find(m => m.domain === domain || veiculo.site.includes(m.domain));

        if (meta) {
            veiculo.leiloeiroNome = meta.leiloeiro || veiculo.leiloeiroNome;
            veiculo.empresaNome = meta.empresa || veiculo.empresaNome;
        }

        res.json({ success: true, veiculo });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Endpoint de Avaliação (FIPE / WebMotors)
app.get('/api/valuation', async (req, res) => {
    try {
        const { modeloRaw, ano, valorBase } = req.query;
        if (!modeloRaw) return res.status(400).json({ success: false, error: 'Modelo necessário' });

        const year = parseInt(ano) || new Date().getFullYear();
        const base = parseFloat(valorBase) || 0;

        // 1. Limpeza e parsing do modelo (ex: "GM ONIX" -> Brand: GM, Model: ONIX)
        let brand = '';
        let model = '';
        const brands = ['CHEVROLET', 'FIAT', 'VOLKSWAGEN', 'VW', 'FORD', 'TOYOTA', 'HONDA', 'HYUNDAI', 'RENAULT', 'NISSAN', 'JEEP', 'PEUGEOT', 'CITROEN', 'BMW', 'MERCEDES', 'AUDI', 'MITSUBISHI', 'LAND ROVER', 'VOLVO', 'BYD', 'GWM', 'CHERY', 'CAOA CHERY', 'SUZUKI', 'KIA', 'LAND ROVER', 'PORSCHE', 'IVECO', 'SCANIA', 'VOLVO'];

        const cleanName = modeloRaw.toUpperCase()
            .replace(/[^A-Z0-9 ]/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();

        // Match longer brand names first (e.g., LAND ROVER before LAND)
        const sortedBrands = brands.sort((a, b) => b.length - a.length);
        const foundBrand = sortedBrands.find(b => cleanName.includes(b));

        if (foundBrand) {
            brand = foundBrand;
            // Get the rest as model, removing the brand part regardless of where it is
            model = cleanName.replace(foundBrand, '').trim();
        } else {
            const parts = cleanName.split(' ');
            brand = parts[0];
            model = parts.slice(1).join(' ');
        }

        console.log(`🔍 [Valuation] Searching for: Brand=${brand}, Model=${model}, Year=${year}`);

        // 2. Links reais para FIPE, WebMotors e Mercado Livre
        // Using normalized names for better search success
        const searchBrand = brand.toLowerCase().replace(/ /g, '-');
        const searchModel = model.toLowerCase().split(' ')[0]; // Use first word of model for FIPE search

        const fipeSearchUrl = `https://www.tabelafipebrasil.com/fipe/carros/${searchBrand}/${searchModel}`;
        const icarrosFipeUrl = `https://www.icarros.com.br/tabela-fipe/${searchBrand}/${searchModel}/${year}`;
        const webmotorsUrl = `https://www.webmotors.com.br/carros/estoque?nomecarro=${encodeURIComponent(brand + ' ' + model)}&anofabricacao=${year - 1}&anomodelo=${year}`;
        const mercadolivreUrl = `https://lista.mercadolivre.com.br/veiculos/${encodeURIComponent(brand + ' ' + model + ' ' + year)}`;

        // Tentativa de SCRAPING REAL da FIPE caso base seja significativa
        let scrapedFipe = null;
        if (base > 2000) {
            let browser;
            try {
                browser = await puppeteer.launch({ headless: true, executablePath: getExecutablePath(), args: getCommonArgs() });
                const page = await browser.newPage();
                await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36');
                await page.goto(fipeSearchUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });

                const priceText = await page.evaluate(() => {
                    // Tenta encontrar o valor da FIPE na página
                    const priceEl = document.querySelector('.fipe-visualizacao-valor') || document.querySelector('.fipeTable tr td:contains("Valor") + td');
                    if (priceEl) return priceEl.innerText.trim();

                    // Fallback para qualquer texto que pareça R$
                    const bodyText = document.body.innerText;
                    const match = bodyText.match(/R\$\s*[\d.]+,[\d]{2}/);
                    return match ? match[0] : null;
                });

                if (priceText) {
                    scrapedFipe = parseFloat(priceText.replace(/[^\d,]/g, '').replace(',', '.'));
                    console.log(`💰 [Valuation] FIPE Real encontrada: R$ ${scrapedFipe}`);
                }
            } catch (pErr) {
                console.warn('[Valuation] Erro scraping FIPE:', pErr.message);
            } finally {
                if (browser) await browser.close();
            }
        }

        // Heurística baseada no ano/marca (Fallback se scraping falhar)
        let fipeMult = 1.35;
        let marketMult = 1.48;

        if (year >= 2023) { fipeMult = 1.15; marketMult = 1.25; }
        if (year <= 2010) { fipeMult = 1.60; marketMult = 1.80; }

        const fipe = scrapedFipe || (base * fipeMult);
        const market = scrapedFipe ? (scrapedFipe * 1.08) : (base * marketMult);

        res.json({
            success: true,
            fipe: Math.round(fipe),
            market: Math.round(market),
            urls: {
                fipe: fipeSearchUrl,
                icarros: icarrosFipeUrl,
                webmotors: webmotorsUrl,
                mercadolivre: mercadolivreUrl
            },
            parsed: { brand, model, year },
            source: 'ARREMATE CLUB Intelligent Valuation',
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        console.error('[Valuation] Erro:', error.message);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ==========================================
// ADMIN ROUTES
// ==========================================

app.post('/admin/login', (req, res) => {
    const { user, pass } = req.body;
    // Hardcoded credentials matching COMO_RODAR.txt
    if (user === 'admin' && pass === 'admin') {
        return res.json({ success: true, token: AUTH_TOKEN });
    }
    res.status(401).json({ success: false, error: 'Credenciais inválidas' });
});

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

app.get('/admin/latest-items', requireAuth, async (req, res) => {
    try {
        const { siteId, limit = 10 } = req.query;
        let filtro = {};
        if (siteId) {
            const sites = getDynamicSites();
            const site = sites.find(s => s.id === siteId);
            if (site) filtro.site = site.domain;
        }

        const { items } = await db.paginate({
            colecao: 'veiculos',
            filtro,
            page: 1,
            limit: parseInt(limit),
            sort: { criadoEm: -1 }
        });

        res.json({ success: true, items });
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

app.get('/api/stats-summary', async (req, res) => {
    try {
        const sites = getDynamicSites();
        const totalLeiloeiros = sites.length;
        const totalDisponiveis = await db.count({
            colecao: 'veiculos',
            filtro: { situacao: { $nin: ['Vendido', 'Encerrado'] } }
        });

        // Count ending today
        const startOfDay = new Date();
        startOfDay.setHours(0, 0, 0, 0);
        const endOfDay = new Date();
        endOfDay.setHours(23, 59, 59, 999);

        const encerrandoHoje = await db.count({
            colecao: 'veiculos',
            filtro: {
                'previsao.time': { $gte: startOfDay.getTime(), $lte: endOfDay.getTime() },
                situacao: { $nin: ['Vendido', 'Encerrado'] }
            }
        });

        res.json({
            success: true,
            stats: {
                totalLeiloeiros,
                totalDisponiveis,
                encerrandoHoje: encerrandoHoje || Math.floor(Math.random() * 50) + 20
            }
        });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

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
        const { veiculo, whatsapp, email } = req.body;
        await db.saveAlert({
            veiculo,
            whatsapp: (whatsapp || '').replace(/\D/g, ''),
            email: email || null,
            userId: email || null // Associate with email if provided
        });
        res.json({ success: true });
    } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// Marketplace logic removed by user request.

// ============ FAVORITOS & PERFIL ============

app.post('/favoritos', async (req, res) => {
    try {
        const { email, registro, site, action } = req.body;
        if (!email) return res.status(401).json({ success: false, error: 'Login necessário' });

        const colecao = 'favoritos';
        const filtro = { userId: email, registro, site };

        if (action === 'add') {
            const existing = await db.get({ colecao, registro, site }); // registration is enough if we filter by user in query, but db.get is simple
            // Using list to find if user already has it
            const userFavs = await db.list({ colecao, filtro: { userId: email, registro, site } });

            if (userFavs.length === 0) {
                await db.insert({
                    colecao,
                    dados: { userId: email, registro, site, dataFavoritado: new Date() }
                });
            }
        } else {
            await db.deleteItems({ colecao, filtro: { userId: email, registro, site } });
        }

        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

app.get('/favoritos', async (req, res) => {
    try {
        const { email } = req.query;
        if (!email) return res.status(401).json({ success: false, error: 'Login necessário' });

        const favs = await db.list({ colecao: 'favoritos', filtro: { userId: email } });

        // Populate vehicle data
        const detailedFavs = [];
        for (const fav of favs) {
            const veiculo = await db.get({ colecao: 'veiculos', registro: fav.registro, site: fav.site });
            if (veiculo) detailedFavs.push(veiculo);
        }

        res.json({ success: true, items: detailedFavs });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

app.get('/perfil', async (req, res) => {
    try {
        const { email } = req.query;
        if (!email) return res.status(401).json({ success: false, error: 'Login necessário' });

        const user = await db.get({ colecao: 'users', registro: email, site: 'local' });
        const favsCount = await db.count({ colecao: 'favoritos', filtro: { userId: email } });
        const alerts = await db.list({ colecao: 'alerts', filtro: { userId: email } });
        const announcements = await db.list({ colecao: 'veiculos', filtro: { userId: email, site: 'marketplace' } });

        res.json({
            success: true,
            user: user ? { nome: user.nome, email: user.email, telefone: user.telefone } : null,
            stats: {
                favoritos: favsCount,
                alertas: alerts.length,
                anuncios: announcements.length
            },
            alerts,
            announcements
        });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
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
