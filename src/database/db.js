import { MongoClient, ObjectId } from 'mongodb';
import dotenv from 'dotenv';

dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/leiloes';
const MONGODB_DB = process.env.MONGODB_DB || 'leiloes';

let clientInstance = null;
let dbInstance = null;

/**
 * Conecta ao MongoDB e retorna funções de acesso ao banco
 */
export const connectDatabase = async () => {
    if (dbInstance) {
        return getDbFunctions();
    }

    try {
        clientInstance = new MongoClient(MONGODB_URI);
        await clientInstance.connect();
        dbInstance = clientInstance.db(MONGODB_DB);
        console.log('✅ MongoDB conectado com sucesso');
        return getDbFunctions();
    } catch (error) {
        console.error('❌ Erro ao conectar ao MongoDB:', error.message);
        throw error;
    }
};

/**
 * Retorna as funções de acesso ao banco
 */
const getDbFunctions = () => {
    const db = dbInstance;

    /**
     * Busca lista de veículos com filtros
     */
    const buscarLista = async ({ colecao = 'veiculos', filtraEncerrados, encerrando, filtroHoras }) => {
        const collection = db.collection(colecao);
        const filtro = {};
        const data = new Date();

        if (encerrando) {
            filtro.encerrado = { $gte: 1 };
        } else if (filtraEncerrados) {
            filtro.encerrado = { $ne: true };
        }

        if (filtroHoras === '30') {
            data.setTime(data.getTime() + (30 * 60 * 1000));
            filtro['previsao.time'] = { $lt: data.getTime() };
        } else if (filtroHoras === '2') {
            data.setTime(data.getTime() + (30 * 60 * 1000));
            const inicial = data.getTime();
            data.setTime(data.getTime() + (120 * 60 * 1000));
            const final = data.getTime();
            filtro['previsao.time'] = { $gte: inicial, $lt: final };
        } else if (filtroHoras === '6') {
            data.setTime(data.getTime() + (120 * 60 * 1000));
            const inicial = data.getTime();
            data.setTime(data.getTime() + (240 * 60 * 1000));
            const final = data.getTime();
            filtro['previsao.time'] = { $gte: inicial, $lt: final };
        } else if (filtroHoras === '+6') {
            data.setTime(data.getTime() + (240 * 60 * 1000));
            filtro['$or'] = [{ 'previsao.time': { $gte: data.getTime() } }, { 'previsao.string': '' }];
        }

        return await collection.find(filtro).toArray();
    };

    /**
     * Busca lista genérica com filtro e projeção
     */
    const list = async ({ colecao = 'veiculos', filtro = {}, colunas = {} }) => {
        try {
            const collection = db.collection(colecao);
            return await collection.find(filtro).project(colunas).toArray();
        } catch (error) {
            console.error(`Erro na busca em ${colecao}:`, error);
            return [];
        }
    };

    /**
     * Busca item único
     */
    const get = async ({ colecao = 'veiculos', registro, site }) => {
        try {
            const collection = db.collection(colecao);
            const filtro = { registro };
            if (site) filtro.site = site;
            return await collection.findOne(filtro);
        } catch (error) {
            console.error('Erro no GET:', error);
            return null;
        }
    };

    /**
     * Insere novo documento
     */
    const insert = async ({ colecao = 'veiculos', dados }) => {
        try {
            const collection = db.collection(colecao);
            const resposta = await collection.insertOne({
                criadoEm: new Date(),
                ...dados,
                log: [{
                    momento: new Date(),
                    acao: 'insert',
                    dadoSalvo: dados
                }]
            });
            return resposta.insertedId.toString();
        } catch (error) {
            console.error(`Erro ao inserir em ${colecao}:`, error);
            return null;
        }
    };

    /**
     * Atualiza documento existente
     */
    const update = async ({ colecao = 'veiculos', registro, set, debugUpdate = false }) => {
        try {
            const collection = db.collection(colecao);
            const item = await collection.findOne({ registro });

            if (!item) return false;

            if (debugUpdate) console.log('UPDATE:', registro, set);

            set.log = (item.log || []).concat([{
                momento: new Date(),
                acao: 'update',
                dadoSalvo: JSON.stringify(set)
            }]);
            set.atualizadoEm = new Date();

            const resposta = await collection.updateOne(
                { _id: new ObjectId(item._id.toString()) },
                { $set: set }
            );

            return resposta.modifiedCount > 0;
        } catch (error) {
            console.error('Erro no UPDATE:', error);
            return false;
        }
    };

    /**
     * Salva lista de veículos (insere ou atualiza)
     */
    const salvarLista = async (lista, debugUpdate = false) => {
        const colecao = 'veiculos';
        let inseridos = 0;
        let atualizados = 0;
        let semAlteracao = 0;

        for (let idx = 0; idx < lista.length; idx++) {
            const item = lista[idx];
            const { registro, site } = item;
            const itemBanco = await get({ colecao, registro, site });

            if (itemBanco) {
                const setDados = {};

                Object.entries(item)
                    .filter(([key]) => !['original'].includes(key))
                    .forEach(([key, value]) => {
                        if (key && JSON.stringify(itemBanco[key]) !== JSON.stringify(value)) {
                            setDados[key] = value;
                        }
                    });

                if (item.original) {
                    Object.entries(item.original).forEach(([key, value]) => {
                        if (key && JSON.stringify(itemBanco.original?.[key]) !== JSON.stringify(value)) {
                            setDados[`original.${key}`] = value;
                        }
                    });
                }

                if (Object.keys(setDados).length > 0) {
                    const atualizado = await update({ colecao, registro, set: setDados, debugUpdate });
                    if (atualizado) atualizados++;
                    console.log(`[${idx + 1}/${lista.length}] ${typeof registro === 'object' ? JSON.stringify(registro) : registro} - Atualizado`);
                } else {
                    semAlteracao++;
                    console.log(`[${idx + 1}/${lista.length}] ${typeof registro === 'object' ? JSON.stringify(registro) : registro} - Sem alterações`);
                }
            } else {
                const id = await insert({ colecao, dados: item });
                if (id) inseridos++;
                console.log(`[${idx + 1}/${lista.length}] ${typeof registro === 'object' ? JSON.stringify(registro) : registro} - Inserido (${id})`);
            }
        }

        console.log(`\n📊 Resumo: ${inseridos} inseridos, ${atualizados} atualizados, ${semAlteracao} sem alteração`);
        return { inseridos, atualizados, semAlteracao };
    };

    /**
     * Conta documentos
     */
    const count = async ({ colecao = 'veiculos', filtro = {} }) => {
        const collection = db.collection(colecao);
        return await collection.countDocuments(filtro);
    };

    /**
     * Busca com paginação
     */
    const paginate = async ({ colecao = 'veiculos', filtro = {}, page = 1, limit = 20, sort = { criadoEm: -1 } }) => {
        const collection = db.collection(colecao);
        const skip = (page - 1) * limit;

        const [items, total] = await Promise.all([
            collection.find(filtro).sort(sort).skip(skip).limit(limit).toArray(),
            collection.countDocuments(filtro)
        ]);

        return {
            items,
            pagination: {
                page,
                limit,
                total,
                totalPages: Math.ceil(total / limit)
            }
        };
    };

    /**
     * Fecha conexão
     */
    const close = async () => {
        if (clientInstance) {
            await clientInstance.close();
            clientInstance = null;
            dbInstance = null;
            console.log('MongoDB desconectado');
        }
    };

    /**
     * Deleta itens
     */
    const deleteItems = async ({ colecao = 'veiculos', filtro = {} }) => {
        try {
            const collection = db.collection(colecao);
            const res = await collection.deleteMany(filtro);
            return res.deletedCount;
        } catch (error) {
            console.error('Erro ao deletar:', error);
            return 0;
        }
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
        update
    };
};

export default connectDatabase;
