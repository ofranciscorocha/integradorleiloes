
import connectDatabase from '../src/database/db.js';

(async () => {
    try {
        const db = await connectDatabase();

        // Let's delete by registro and site as they are the primary identifiers
        // Also delete by ID just in case
        const count = await db.deleteItems({
            colecao: 'veiculos',
            filtro: {
                site: 'patiorochaleiloes.com.br',
                registro: 'detalhes'
            }
        });

        console.log(`Removidos ${count} itens do Pátio Rocha.`);

        await db.close();
    } catch (error) {
        console.error('Erro:', error);
    }
})();
