
import connectDatabase from '../src/database/db.js';

async function checkCounts() {
    try {
        const db = await connectDatabase();
        if (!db) {
            console.error('Falha ao conectar ao banco.');
            return;
        }

        const veiculos = await db.list({ colecao: 'veiculos' });
        console.log(`Total de veículos: ${veiculos.length}`);

        const counts = veiculos.reduce((acc, v) => {
            acc[v.site] = (acc[v.site] || 0) + 1;
            return acc;
        }, {});

        console.log('\nContagem por site:');
        Object.entries(counts)
            .sort((a, b) => b[1] - a[1])
            .forEach(([site, count]) => {
                console.log(`${site.padEnd(25)}: ${count}`);
            });

        process.exit(0);
    } catch (error) {
        console.error('Erro:', error);
        process.exit(1);
    }
}

checkCounts();
