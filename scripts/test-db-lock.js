
import connectDatabase from '../src/database/db.js';

async function testLockSalvarLista() {
    const db = await connectDatabase();
    const SITE = 'test-site';

    // Reset test data
    await db.deleteBySite({ site: SITE });

    console.log('🚀 Starting parallel salvarLista calls...');

    const parallelCalls = 5;
    const itemsPerCall = 20;
    const tasks = [];

    for (let i = 0; i < parallelCalls; i++) {
        tasks.push((async (id) => {
            const list = [];
            for (let j = 0; j < itemsPerCall; j++) {
                list.push({
                    site: SITE,
                    registro: `item_${id}_${j}`,
                    veiculo: `Veículo ${id}-${j}`,
                    valor: 1000
                });
            }
            console.log(`子 [${id}] Sending ${itemsPerCall} items...`);
            await db.salvarLista(list);
            console.log(`子 [${id}] Finished.`);
        })(i));
    }

    await Promise.all(tasks);

    const count = await db.count({ colecao: 'veiculos', filtro: { site: SITE } });
    const expected = parallelCalls * itemsPerCall;
    console.log(`\n📊 Final Count for ${SITE}: ${count} (Expected: ${expected})`);

    if (count === expected) {
        console.log('✅ LOCK TEST PASSED!');
    } else {
        console.log('❌ LOCK TEST FAILED! Data loss detected.');
    }
}

testLockSalvarLista();
