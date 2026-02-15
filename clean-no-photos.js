import connectDatabase from './src/database/db.js';

async function cleanup() {
    console.log('🧹 Iniciando limpeza de lotes sem foto...');
    const db = await connectDatabase();

    try {
        const query = {
            $or: [
                { fotos: { $exists: false } },
                { fotos: { $size: 0 } },
                { "fotos.0": { $exists: false } }
            ]
        };

        const removed = await db.deleteItems({
            colecao: 'veiculos',
            filtro: query
        });

        console.log(`✅ Limpeza concluída! ${removed} lotes sem foto foram removidos.`);
    } catch (e) {
        console.error('❌ Erro na limpeza:', e.message);
    } finally {
        if (db.close) await db.close();
        process.exit(0);
    }
}

cleanup();
