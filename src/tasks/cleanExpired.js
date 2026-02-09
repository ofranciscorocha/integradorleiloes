import connectDatabase from '../database/db.js';

const cleanExpired = async () => {
    console.log('🧹 Iniciando limpeza de leilões expirados...');
    try {
        const db = await connectDatabase();
        if (!db) return;

        // Considerando "acabar o leilão" como data do leilão passada
        // O campo 'previsao.time' tem o timestamp

        const now = Date.now();
        // Dá uma margem de segurança de 24h para não deletar algo que acabou de acontecer e ainda pode ser consultado?
        // O usuário disse: "quando acabar o leilão... ele sair do nosso banco"
        // Vou deletar imediatamente após a data prevista.

        const deletedCount = await db.deleteItems({
            colecao: 'veiculos',
            filtro: { 'previsao.time': { $lt: now } }
        });

        console.log(`🧹 Removidos ${deletedCount} leilões expirados.`);
        return deletedCount;
    } catch (e) {
        console.error('Erro na limpeza:', e);
        return 0;
    }
};

export default cleanExpired;
