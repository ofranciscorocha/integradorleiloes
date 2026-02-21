
import connectDatabase from './src/database/db.js';

async function checkFreitas() {
    const db = await connectDatabase();
    const items = await db.list({
        colecao: 'veiculos',
        filtro: { site: 'freitasleiloeiro.com.br' },
        limit: 5,
        sort: { criadoEm: -1 }
    });

    console.log(`Found ${items.length} items for Freitas.`);
    items.forEach(item => {
        console.log(`- Title: ${item.veiculo}`);
        console.log(`  Links: ${item.link}`);
        console.log(`  Fotos: ${JSON.stringify(item.fotos)}`);
        console.log('---');
    });

    process.exit(0);
}

checkFreitas();
