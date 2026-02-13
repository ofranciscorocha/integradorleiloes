import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATA_DIR = path.join(__dirname, '../../data');

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
}
console.log('📂 Data Directory:', path.resolve(DATA_DIR));

const getFilePath = (collection) => path.join(DATA_DIR, `${collection}.json`);

const readData = (collection) => {
    const filePath = getFilePath(collection);
    if (!fs.existsSync(filePath)) {
        return [];
    }
    try {
        const data = fs.readFileSync(filePath, 'utf-8');
        return JSON.parse(data);
    } catch (e) {
        console.error(`Erro ao ler ${collection}:`, e);
        return [];
    }
};

const writeData = (collection, data) => {
    const filePath = getFilePath(collection);
    try {
        fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
    } catch (e) {
        console.error(`Erro ao salvar ${collection}:`, e);
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

        // Handle $or array (search text across multiple fields)
        if (key === '$or' && Array.isArray(val)) {
            const matchOne = val.some(cond => {
                const k = Object.keys(cond)[0];
                const v = cond[k];
                const itemVal = String(item[k] || '');
                if (v instanceof RegExp) return v.test(itemVal);
                // Handle {$regex, $options} objects
                if (typeof v === 'object' && v !== null && v.$regex) {
                    try {
                        const re = new RegExp(v.$regex, v.$options || '');
                        return re.test(itemVal);
                    } catch { return false; }
                }
                return itemVal === v;
            });
            if (!matchOne) return false;
            continue;
        }

        if (typeof val === 'object' && val !== null) {
            // Handle {$regex, $options} pattern
            if (val.$regex !== undefined) {
                try {
                    const re = new RegExp(val.$regex, val.$options || '');
                    if (!re.test(String(item[key] || ''))) return false;
                } catch { return false; }
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
        } else if (val !== undefined && val !== '' && item[key] != val) {
            return false;
        }
    }
    return true;
};

const connectDatabase = async () => {
    console.log('✅ JSON Database conectado (Modo Arquivo)');

    const buscarLista = async ({ colecao = 'veiculos', filtraEncerrados, encerrando, filtroHoras }) => {
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
    };

    const update = async ({ colecao = 'veiculos', registro, site, set, debugUpdate = false }) => {
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
        const alerts = readData('alerts');
        const newAlert = {
            id: Date.now().toString(),
            ...alertData,
            createdAt: new Date().toISOString()
        };
        alerts.push(newAlert);
        writeData('alerts', alerts);
        return newAlert;
    };

    const deleteItems = async ({ colecao, filtro }) => {
        let items = readData(colecao);
        const initialCount = items.length;

        // Filtra para manter somente quem NÃO bate com o filtro de deleção
        items = items.filter(item => !matchesFilter(item, filtro));

        writeData(colecao, items);
        return initialCount - items.length;
    };


    const salvarLista = async (lista, debugUpdate = false) => {
        const colecao = 'veiculos';
        const items = readData(colecao);
        let inseridos = 0;
        let atualizados = 0;
        let semAlteracao = 0;

        for (const novoItem of lista) {
            const regStr = typeof novoItem.registro === 'object' ? JSON.stringify(novoItem.registro) : novoItem.registro;
            const index = items.findIndex(i => {
                const itemRegStr = typeof i.registro === 'object' ? JSON.stringify(i.registro) : i.registro;
                return itemRegStr === regStr && i.site === novoItem.site;
            });

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
        console.log(`\n📊 Resumo JSON: ${inseridos} inseridos, ${atualizados} atualizados, ${semAlteracao} sem alteração`);
        return { inseridos, atualizados, semAlteracao };
    };

    const overwrite = async ({ colecao = 'veiculos', data }) => {
        writeData(colecao, data);
        console.log(`♻️ Coleção ${colecao} sobrescrita com ${data.length} itens.`);
    };


    const paginate = async ({ colecao = 'veiculos', filtro = {}, page = 1, limit = 20, sort = { criadoEm: -1 }, interleave = false, shuffle = false }) => {
        let items = readData(colecao);

        // 1. Filter
        if (filtro) {
            items = items.filter(item => matchesFilter(item, filtro));
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
        // In file-based mode, reading happens on demand in some methods, but not all.
        // Actually, readData is called in every method (get, list, paginate).
        // BUT, if we want to ensure any internal caching is cleared (if we had any), we would do it here.
        // Since readData reads from FS every time, 'reload' is mostly about confirming connectivity or clearing any potential memory cache if we added one.
        // For now, let's just log and maybe return status.
        // Wait, if we use in-memory cache later, this is where we clear it.
        return true;
    };

    return {
        buscarLista,
        close,
        count,
        deleteItems,
        get,
        insert,
        list,
        paginate,
        salvarLista,
        update,
        overwrite,
        getAlerts,
        overwrite,
        getAlerts,
        saveAlert,
        reload
    };
};

export default connectDatabase;
