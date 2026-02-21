import connectDatabase from './src/database/db.js';

const check = async () => {
    const db = await connectDatabase();
    // Assuming 'veiculos' collection
    const count = await db.count({ colecao: 'veiculos', filtro: { site: 'copart.com.br' } });
    console.log(`Current Copart count: ${count}`);

    // Also check total
    const total = await db.count({ colecao: 'veiculos' });
    console.log(`Total vehicles: ${total}`);

    await db.close();
};

check();
