import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { MongoClient } from 'mongodb';
import 'dotenv/config';
import { enrichmentService } from '../utils/enrichment.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATA_DIR = path.join(__dirname, '../../data');

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
}
console.log('📂 Data Directory:', path.resolve(DATA_DIR));

const getFilePath = (collection) => path.join(DATA_DIR, `${collection}.json`);

// Memory Cache for JSON mode
const jsonCache = {};

const readData = (collection) => {
    // Return from cache if available
    if (jsonCache[collection]) return jsonCache[collection];

    const filePath = getFilePath(collection);
    if (!fs.existsSync(filePath)) {
        jsonCache[collection] = [];
        return [];
    }
    try {
        const data = fs.readFileSync(filePath, 'utf-8');
        if (!data.trim()) {
            jsonCache[collection] = [];
            return [];
        }
        const parsed = JSON.parse(data);
        jsonCache[collection] = parsed;
        return parsed;
    } catch (e) {
        console.error(`❌ Erro crítico ao ler ${collection}:`, e.message);
        if (e instanceof SyntaxError) {
            console.log(`⚠️ Database ${collection} parece corrompido. Tentando recuperar...`);
            jsonCache[collection] = [];
            return [];
        }
        throw new Error(`Falha ao ler banco de dados ${collection}. Operação abortada para evitar perda de dados.`);
    }
};

const writeData = (collection, data) => {
    // Update cache first
    jsonCache[collection] = data;

    const filePath = getFilePath(collection);
    const tempPath = `${filePath}.tmp`;
    try {
        // Atomic write: write to temp file then rename
        fs.writeFileSync(tempPath, JSON.stringify(data, null, 2), 'utf-8');
        fs.renameSync(tempPath, filePath);
    } catch (e) {
        console.error(`Erro ao salvar ${collection}:`, e);
    }
};

/**
 * File-based lock to prevent race conditions in JSON mode
 */
const acquireLock = async (collection) => {
    const lockPath = path.join(DATA_DIR, `${collection}.lock`);
    const maxRetries = 200;
    const retryDelay = 150;

    for (let i = 0; i < maxRetries; i++) {
        try {
            // mkdir is atomic in the OS
            fs.mkdirSync(lockPath);
            return true;
        } catch (e) {
            if (e.code === 'EEXIST') {
                // If lock exists but is very old (e.g. 5 mins), force release it
                try {
                    const stats = fs.statSync(lockPath);
                    const now = Date.now();
                    const age = now - stats.mtimeMs;
                    if (age > 1000 * 60 * 5) {
                        console.log(`⚠️ Lock para ${collection} expirado (${Math.round(age / 1000)}s). Forçando liberação.`);
                        fs.rmdirSync(lockPath);
                        continue;
                    }
                } catch (stErr) { }

                await new Promise(r => setTimeout(r, retryDelay));
            } else {
                throw e;
            }
        }
    }
    throw new Error(`Timeout ao tentar adquirir lock para ${collection}`);
};

const releaseLock = (collection) => {
    const lockPath = path.join(DATA_DIR, `${collection}.lock`);
    try {
        if (fs.existsSync(lockPath)) {
            fs.rmdirSync(lockPath);
        }
    } catch (e) {
        console.error(`Erro ao liberar lock para ${collection}:`, e.message);
    }
};

/**
 * Conecta ao "Banco JSON" e retorna funções de acesso
 */
export const matchesFilter = (item, filtro) => {
    if (!filtro || Object.keys(filtro).length === 0) return true;

    for (const key in filtro) {
        const val = filtro[key];

        if (val instanceof RegExp) {
            if (!val.test(item[key])) return false;
            continue;
        }

        // Handle $and array (All conditions must match)
        if (key === '$and' && Array.isArray(val)) {
            if (!val.every(cond => matchesFilter(item, cond))) return false;
            continue;
        }

        // Handle $or array (At least one condition must match)
        if (key === '$or' && Array.isArray(val)) {
            if (!val.some(cond => matchesFilter(item, cond))) return false;
            continue;
        }

        if (typeof val === 'object' && val !== null && !(val instanceof Date)) {
            // Handle {$regex, $options} pattern
            if (val.$regex !== undefined) {
                try {
                    const re = new RegExp(val.$regex, val.$options || '');
                    if (!re.test(String(item[key] || ''))) return false;
                } catch { return false; }
                continue;
            }

            // Handle $in
            if (val.$in && Array.isArray(val.$in)) {
                if (!val.$in.includes(item[key])) return false;
                continue;
            }

            // Handle $nin
            if (val.$nin && Array.isArray(val.$nin)) {
                if (val.$nin.includes(item[key])) return false;
                continue;
            }

            // Handle $not (can be a regex or another condition)
            if (val.$not) {
                const subFilter = { [key]: val.$not };
                if (matchesFilter(item, subFilter)) return false;
                continue;
            }

            // Handle range comparisons ($gte, $lte, $gt, $lt)
            let itemVal = item[key];
            if (key === 'criadoEm' && typeof itemVal === 'string') itemVal = new Date(itemVal).getTime();
            else if (itemVal instanceof Date) itemVal = itemVal.getTime();

            // Normalize val if it's a date or timestamp
            const checkVal = (v) => (v instanceof Date ? v.getTime() : v);

            if (val.$gte !== undefined && (itemVal === undefined || itemVal < checkVal(val.$gte))) return false;
            if (val.$lte !== undefined && (itemVal === undefined || itemVal > checkVal(val.$lte))) return false;
            if (val.$gt !== undefined && (itemVal === undefined || itemVal <= checkVal(val.$gt))) return false;
            if (val.$lt !== undefined && (itemVal === undefined || itemVal >= checkVal(val.$lt))) return false;
        } else if (key === 'fotos.0' && val && val.$exists) {
            if (!item.fotos || !item.fotos[0]) return false;
        } else if (val !== undefined && val !== '' && item[key] != val) {
            return false;
        }
    }
    return true;
};

const connectDatabase = async () => {
    const mongoUri = process.env.MONGODB_URI || process.env.MONGODB_URL || process.env.MONGO_URL || process.env.DATABASE_URL;

    if (mongoUri && mongoUri !== 'undefined' && mongoUri.startsWith('mongodb')) {
        try {
            const maskedUri = mongoUri.replace(/\/\/.*?:.*?@/, '//***:***@');
            console.log(`🔌 Tentando conectar ao MongoDB: ${maskedUri}`);
            const client = new MongoClient(mongoUri, {
                serverSelectionTimeoutMS: 2000 // 2 seconds timeout
            });
            await client.connect();
            const db = client.db();
            console.log('✅ MongoDB conectado com sucesso!');

            // collections
            const veiculos = db.collection('veiculos');
            const alerts = db.collection('alerts');

            // Seed/Migration from JSON if empty
            const totalInMongo = await veiculos.countDocuments();
            if (totalInMongo === 0) {
                console.log('🚚 MongoDB vazio. Iniciando migração do JSON...');
                const jsonData = readData('veiculos');
                if (jsonData.length > 0) {
                    // Remove _id from JSON to avoid conflicts and let Mongo generate new ones if needed, 
                    // or keep them if they are unique. JSON _ids are custom strings.
                    await veiculos.insertMany(jsonData);
                    console.log(`✅ Migração concluída: ${jsonData.length} veículos importados.`);
                }
            }

            // Implementation methods
            const buscarLista = async (params = {}) => {
                const { colecao = 'veiculos', filtraEncerrados, encerrando, ...query } = params;
                const mongoQuery = { ...query };
                if (encerrando) mongoQuery.encerrado = { $gte: 1 };
                if (filtraEncerrados) mongoQuery.encerrado = { $ne: true };
                return await db.collection(colecao).find(mongoQuery).toArray();
            };

            const list = async ({ colecao = 'veiculos', filtro = {} }) => {
                return await db.collection(colecao).find(filtro).toArray();
            };

            const get = async ({ colecao = 'veiculos', registro, site }) => {
                return await db.collection(colecao).findOne({ registro, site });
            };

            const insert = async ({ colecao = 'veiculos', dados }) => {
                const doc = {
                    ...dados,
                    criadoEm: new Date(),
                    log: [{ momento: new Date(), acao: 'insert' }]
                };
                const result = await db.collection(colecao).insertOne(doc);
                return result.insertedId;
            };

            const update = async ({ colecao = 'veiculos', registro, site, set }) => {
                const result = await db.collection(colecao).updateOne(
                    { registro, site },
                    {
                        $set: { ...set, atualizadoEm: new Date() },
                        $push: { log: { momento: new Date(), acao: 'update' } }
                    }
                );
                return result.modifiedCount > 0;
            };

            const count = async ({ colecao = 'veiculos', filtro = {} }) => {
                return await db.collection(colecao).countDocuments(filtro);
            };

            const deleteItems = async ({ colecao, filtro }) => {
                const result = await db.collection(colecao).deleteMany(filtro);
                return result.deletedCount;
            };

            const deleteBySite = async ({ site }) => {
                const result = await db.collection('veiculos').deleteMany({ site });
                console.log(`🗑️ Erased ${result.deletedCount} items for site: ${site}`);
                return result.deletedCount;
            };

            const salvarLista = async (lista) => {
                const col = db.collection('veiculos');
                let inseridos = 0;
                let atualizados = 0;
                let semAlteracao = 0;
                let rejeitadosSemFoto = 0;

                // Bulk operations would be better, but keeping it simple for compatibility
                for (const rawItem of lista) {
                    // REQUIREMENT: No photos = No save
                    if (!rawItem.fotos || rawItem.fotos.length === 0 || !rawItem.fotos[0]) {
                        rejeitadosSemFoto++;
                        continue;
                    }

                    // ROBO ENRICHMENT: Only for new items or if fipe missing
                    let item = rawItem;
                    const existing = await col.findOne({ registro: item.registro, site: item.site });

                    if (!existing || !existing.valorFipe) {
                        item.needsEnrichment = true;
                    }

                    if (existing) {
                        // Check if changed
                        const { _id, criadoEm, log, atualizadoEm, ...oldData } = existing;
                        if (JSON.stringify(oldData) !== JSON.stringify(item)) {
                            await col.updateOne(
                                { _id: existing._id },
                                {
                                    $set: { ...item, atualizadoEm: new Date() },
                                    $push: { log: { momento: new Date(), acao: 'update' } }
                                }
                            );
                            atualizados++;
                        } else {
                            semAlteracao++;
                        }
                    } else {
                        await col.insertOne({
                            ...item,
                            criadoEm: new Date(),
                            log: []
                        });
                        inseridos++;
                    }
                }
                console.log(`\n📊 Resumo MongoDB: ${inseridos} inseridos, ${atualizados} atualizados, ${semAlteracao} sem alteração, ${rejeitadosSemFoto} rejeitados (sem foto)`);
                return { inseridos, atualizados, semAlteracao, rejeitadosSemFoto };
            };

            const paginate = async ({ colecao = 'veiculos', filtro = {}, page = 1, limit = 20, sort = { criadoEm: -1 } }) => {
                const col = db.collection(colecao);
                // Ensure filtro is a plain object or defaults to {}
                const query = { ...(filtro || {}) };

                // FORCE: Always filter out items without photos if requested or as a global rule if preferred
                // For now, let's make it easy to toggle or always-on for the listing
                if (!query.fotos && !query["fotos.0"]) {
                    query["fotos.0"] = { $exists: true };
                }

                const total = await col.countDocuments(query);
                const totalPages = Math.ceil(total / limit);
                const skip = (page - 1) * limit;

                // Simple skip/limit for now. Interleave/Shuffle would require aggregation or local processing.
                // Keeping it standard for yield tracking.
                const items = await col.find(query)
                    .sort(sort)
                    .skip(skip)
                    .limit(limit)
                    .toArray();

                return {
                    items,
                    pagination: { page, limit, total, totalPages }
                };
            };

            const getAlerts = async () => await alerts.find({}).toArray();
            const saveAlert = async (data) => {
                const doc = { ...data, createdAt: new Date() };
                await alerts.insertOne(doc);
                return doc;
            };

            const overwrite = async ({ colecao, data }) => {
                await db.collection(colecao).deleteMany({});
                if (data.length > 0) await db.collection(colecao).insertMany(data);
            };

            const reload = async () => true;

            const dbInterface = {
                buscarLista, close, count, deleteItems, deleteBySite, get, insert, list, paginate, salvarLista, update, overwrite, getAlerts, saveAlert, reload
            };

            // Migration: Fix Palacio Links
            (async () => {
                try {
                    const SITE = 'palaciodosleiloes.com.br';
                    const items = await buscarLista({ colecao: 'veiculos' });
                    for (const v of items) {
                        if (v.site === SITE && v.link && v.link.includes('lote.php')) {
                            const [leilaoId, registroLote] = v.registro.split('_');
                            if (leilaoId && registroLote) {
                                const newLink = `https://www.palaciodosleiloes.com.br/site/?opcao=exibir_lote&id_lote=${registroLote}&id_leilao=${leilaoId}`;
                                await update({ colecao: 'veiculos', registro: v.registro, site: SITE, set: { link: newLink } });
                            }
                        }
                    }
                } catch (e) { console.error('Migration error:', e); }
            })();

            return dbInterface;

        } catch (e) {
            console.error('❌ Erro ao conectar ao MongoDB, caindo para modo JSON:', e.message);
        }
    }

    if (!mongoUri || mongoUri === 'undefined') {
        console.log('ℹ️ MONGODB_URI não detectada ou inválida. Usando JSON Database (Modo Local).');
    } else {
        console.log('⚠️ Conexão com MongoDB falhou mesmo com URI configurada. Usando JSON Fallback.');
    }

    const buscarLista = async ({ colecao = 'veiculos', filtraEncerrados, encerrando, filtroHoras } = {}) => {
        let items = readData(colecao);
        const now = Date.now();

        // 1. Filter Logic
        items = items.filter(item => {
            if (encerrando) {
                // Mock logic for encerrado
                return item.encerrado >= 1;
            }
            if (filtraEncerrados) {
                return item.encerrado !== true;
            }
            return true;
        });

        // 2. Time Filter (Mocked somewhat)
        if (filtroHoras) {
            items = items.filter(item => {
                const time = item.previsao?.time || 0;
                if (!time) return false;

                if (filtroHoras === '30') return time < now + (30 * 60 * 1000);
                // ... simplify other time filters for now
                return true;
            });
        }

        return items;
    };

    const list = async ({ colecao = 'veiculos', filtro = {}, colunas = {} }) => {
        let items = readData(colecao);

        // Simple exact match filter
        if (Object.keys(filtro).length > 0) {
            items = items.filter(item => {
                for (const key in filtro) {
                    if (item[key] !== filtro[key]) return false;
                }
                return true;
            });
        }

        return items;
    };

    const get = async ({ colecao = 'veiculos', registro, site }) => {
        const items = readData(colecao);
        const regStr = typeof registro === 'object' ? JSON.stringify(registro) : registro;
        return items.find(item => {
            const itemRegStr = typeof item.registro === 'object' ? JSON.stringify(item.registro) : item.registro;
            return itemRegStr === regStr && (!site || item.site === site);
        }) || null;
    };

    const insert = async ({ colecao = 'veiculos', dados }) => {
        await acquireLock(colecao);
        try {
            const items = readData(colecao);
            const newItem = {
                _id: Date.now().toString() + Math.random().toString(36).substr(2, 5),
                criadoEm: new Date(),
                ...dados,
                log: [{
                    momento: new Date(),
                    acao: 'insert'
                }]
            };
            items.push(newItem);
            writeData(colecao, items);
            return newItem._id;
        } finally {
            releaseLock(colecao);
        }
    };

    const update = async ({ colecao = 'veiculos', registro, site, set, debugUpdate = false }) => {
        await acquireLock(colecao);
        try {
            const items = readData(colecao);
            const regStr = typeof registro === 'object' ? JSON.stringify(registro) : registro;
            const index = items.findIndex(item => {
                const itemRegStr = typeof item.registro === 'object' ? JSON.stringify(item.registro) : item.registro;
                return itemRegStr === regStr && (!site || item.site === site);
            });

            if (index === -1) return false;

            const item = items[index];
            const updatedItem = { ...item, ...set, atualizadoEm: new Date() };

            updatedItem.log = (item.log || []).concat([{
                momento: new Date(),
                acao: 'update'
            }]);

            items[index] = updatedItem;
            writeData(colecao, items);

            if (debugUpdate) console.log('UPDATE JSON:', registro);
            return true;
        } finally {
            releaseLock(colecao);
        }
    };

    const count = async ({ colecao = 'veiculos', filtro = {} }) => {
        let items = readData(colecao);
        if (Object.keys(filtro).length > 0) {
            items = items.filter(item => matchesFilter(item, filtro));
        }
        return items.length;
    };

    const getAlerts = async () => {
        return readData('alerts');
    };

    const saveAlert = async (alertData) => {
        const col = 'alerts';
        await acquireLock(col);
        try {
            const alerts = readData(col);
            const newAlert = {
                id: Date.now().toString(),
                ...alertData,
                createdAt: new Date().toISOString()
            };
            alerts.push(newAlert);
            writeData(col, alerts);
            return newAlert;
        } finally {
            releaseLock(col);
        }
    };

    const deleteItems = async ({ colecao, filtro }) => {
        await acquireLock(colecao);
        try {
            let items = readData(colecao);
            const initialCount = items.length;

            // Filtra para manter somente quem NÃO bate com o filtro de deleção
            items = items.filter(item => !matchesFilter(item, filtro));

            writeData(colecao, items);
            return initialCount - items.length;
        } finally {
            releaseLock(colecao);
        }
    };

    const deleteBySite = async ({ site }) => {
        const col = 'veiculos';
        await acquireLock(col);
        try {
            let items = readData(col);
            const initialCount = items.length;
            items = items.filter(item => item.site !== site);
            writeData(col, items);
            const removed = initialCount - items.length;
            console.log(`🗑️ [JSON] Erased ${removed} items for site: ${site}`);
            return removed;
        } finally {
            releaseLock(col);
        }
    };


    const salvarLista = async (lista, debugUpdate = false) => {
        const colecao = 'veiculos';
        await acquireLock(colecao);
        try {
            const items = readData(colecao);
            let inseridos = 0;
            let atualizados = 0;
            let semAlteracao = 0;
            let rejeitadosSemFoto = 0;

            for (const novoItemRaw of lista) {
                // REQUIREMENT: No photos = No save
                if (!novoItemRaw.fotos || novoItemRaw.fotos.length === 0 || !novoItemRaw.fotos[0]) {
                    rejeitadosSemFoto++;
                    continue;
                }

                let novoItem = novoItemRaw;
                const regStr = typeof novoItem.registro === 'object' ? JSON.stringify(novoItem.registro) : novoItem.registro;
                const index = items.findIndex(i => {
                    const itemRegStr = typeof i.registro === 'object' ? JSON.stringify(i.registro) : i.registro;
                    return itemRegStr === regStr && i.site === novoItem.site;
                });

                // ROBO ENRICHMENT for JSON mode
                if (index === -1 || !items[index].valorFipe) {
                    novoItem.needsEnrichment = true;
                }

                if (index !== -1) {
                    const itemBanco = items[index];
                    // Simple update if any data changed
                    const { _id, criadoEm, log, atualizadoEm, ...oldData } = itemBanco;
                    const { ...newData } = novoItem;

                    if (JSON.stringify(oldData) !== JSON.stringify(newData)) {
                        items[index] = { ...itemBanco, ...novoItem, atualizadoEm: new Date() };
                        atualizados++;
                    } else {
                        semAlteracao++;
                    }
                } else {
                    items.push({
                        _id: Date.now().toString() + Math.random().toString(36).substr(2, 5),
                        criadoEm: new Date(),
                        ...novoItem,
                        log: []
                    });
                    inseridos++;
                }
            }

            writeData(colecao, items);
            console.log(`\n📊 Resumo JSON: ${inseridos} inseridos, ${atualizados} atualizados, ${semAlteracao} sem alteração, ${rejeitadosSemFoto} rejeitados (sem foto)`);

            if (lista.length > 0) {
                const currentSite = lista[0].site;
                const totalSite = items.filter(i => i.site === currentSite).length;
                console.log(`📈 [${currentSite || 'Geral'}] Total de veículos no banco: ${totalSite}`);
            }

            return { inseridos, atualizados, semAlteracao, rejeitadosSemFoto };
        } finally {
            releaseLock(colecao);
        }
    };

    const overwrite = async ({ colecao = 'veiculos', data }) => {
        await acquireLock(colecao);
        try {
            writeData(colecao, data);
            console.log(`♻️ Coleção ${colecao} sobrescrita com ${data.length} itens.`);
        } finally {
            releaseLock(colecao);
        }
    };


    const paginate = async ({ colecao = 'veiculos', filtro = {}, page = 1, limit = 20, sort = { criadoEm: -1 }, interleave = false, shuffle = false }) => {
        let items = readData(colecao);

        // 1. Filter
        if (filtro) {
            // FORCE: Photos must exist
            if (!filtro.fotos && !filtro["fotos.0"]) {
                filtro["fotos.0"] = { $exists: true };
            }
            items = items.filter(item => matchesFilter(item, filtro));
        } else {
            // Global default filter for photos even if no filter object
            items = items.filter(item => item.fotos && item.fotos.length > 0 && item.fotos[0]);
        }

        // 2. Interleave Logic (Special handling for variant auctioneers)
        if (interleave) {
            // Group by site
            const groups = {};
            items.forEach(item => {
                const s = item.site || 'unknown';
                if (!groups[s]) groups[s] = [];
                groups[s].push(item);
            });

            // Shuffle each group if requested
            if (shuffle) {
                Object.values(groups).forEach(group => {
                    for (let i = group.length - 1; i > 0; i--) {
                        const j = Math.floor(Math.random() * (i + 1));
                        [group[i], group[j]] = [group[j], group[i]];
                    }
                });
            } else {
                // Sort each group by default (criadoEm)
                const key = Object.keys(sort)[0];
                const dir = sort[key];
                Object.values(groups).forEach(group => {
                    group.sort((a, b) => {
                        if (a[key] < b[key]) return -1 * dir;
                        if (a[key] > b[key]) return 1 * dir;
                        return 0;
                    });
                });
            }

            // Interleave (Round-Robin)
            const interleaved = [];
            const siteKeys = Object.keys(groups);
            let hasItems = true;
            let index = 0;

            while (hasItems) {
                hasItems = false;
                for (const site of siteKeys) {
                    if (groups[site].length > index) {
                        interleaved.push(groups[site][index]);
                        hasItems = true;
                    }
                }
                index++;
            }
            items = interleaved;
        } else {
            // Standard Sort
            if (shuffle) {
                for (let i = items.length - 1; i > 0; i--) {
                    const j = Math.floor(Math.random() * (i + 1));
                    [items[i], items[j]] = [items[j], items[i]];
                }
            } else {
                items.sort((a, b) => {
                    const key = Object.keys(sort)[0] || 'criadoEm';
                    const dir = sort[key] || -1;
                    if (a[key] < b[key]) return -1 * dir;
                    if (a[key] > b[key]) return 1 * dir;
                    return 0;
                });
            }
        }

        // 3. Paginate
        const total = items.length;
        const totalPages = Math.ceil(total / limit);
        const start = (page - 1) * limit;
        const pagedItems = items.slice(start, start + limit);

        return {
            items: pagedItems,
            pagination: {
                page,
                limit,
                total,
                totalPages
            }
        };
    };

    const close = async () => {
        console.log('JSON DB fechado');
    };

    const reload = async () => {
        console.log('🔄 Recarregando dados do disco...');
        return true;
    };

    return {
        buscarLista,
        close,
        count,
        deleteItems,
        deleteBySite,
        get,
        insert,
        list,
        paginate,
        salvarLista,
        update,
        overwrite,
        getAlerts,
        saveAlert,
        reload
    };
};

export default connectDatabase;
