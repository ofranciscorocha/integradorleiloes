
import connectDatabase from '../src/database/db.js';

(async () => {
    try {
        const db = await connectDatabase();
        const items = await db.list({
            colecao: 'veiculos',
            filtro: { registro: 'detalhes' }
        });

        if (items.length > 0) {
            console.log(`Encontrados ${items.length} itens com registro "detalhes" em outros sites:`);
            items.forEach(item => {
                console.log(`- Site: ${item.site} | Veículo: ${item.veiculo} | ID: ${item._id}`);
            });
        } else {
            console.log('Nenhum outro item com registro "detalhes" encontrado.');
        }

        await db.close();
    } catch (error) {
        console.error('Erro:', error);
    }
})();
