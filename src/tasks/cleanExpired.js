import connectDatabase from '../database/db.js';

const cleanExpired = async () => {
    console.log('🧹 Iniciando limpeza de leilões expirados...');
    try {
        const db = await connectDatabase();
        if (!db) return;

        // Considerando "acabar o leilão" como data do leilão passada
        // O campo 'previsao.time' tem o timestamp

        const now = Date.now();
        // Dá uma margem de segurança de 12h para não deletar algo que acabou de acontecer
        // Assim leilões do dia continuam visíveis até a madrugada seguinte
        const gracePeriod = 12 * 60 * 60 * 1000;
        const threshold = now - gracePeriod;

        const deletedCount = await db.deleteItems({
            colecao: 'veiculos',
            filtro: { 'previsao.time': { $lt: threshold } }
        });

        console.log(`🧹 Removidos ${deletedCount} leilões expirados.`);
        return deletedCount;
    } catch (e) {
        console.error('Erro na limpeza:', e);
        return 0;
    }
};

export default cleanExpired;
