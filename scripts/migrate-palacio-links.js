import connectDatabase from '../src/database/db.js';

async function migrateLinks() {
    try {
        console.log('🚀 Starting BULK Palácio Link Migration...');
        const db = await connectDatabase();
        if (!db) throw new Error('Could not connect to database');

        console.log('Fetching all items...');
        const allItems = await db.buscarLista({ colecao: 'veiculos' });
        console.log(`Total items in DB: ${allItems.length}`);

        const SITE = 'palaciodosleiloes.com.br';
        let fixed = 0;
        for (const v of allItems) {
            if (v.site === SITE && v.link && v.link.includes('lote/index.php')) {
                const [leilaoId, registroLote] = v.registro.split('_');
                if (leilaoId && registroLote) {
                    v.link = `https://www.palaciodosleiloes.com.br/site/?opcao=exibir_lote&id_lote=${registroLote}&id_leilao=${leilaoId}`;
                    fixed++;
                }
            }
        }

        if (fixed > 0) {
            console.log(`Saving ${fixed} fixed links in bulk...`);
            if (typeof db.overwrite !== 'function') {
                console.error('db.overwrite is not a function!');
                console.log('Available keys:', Object.keys(db));
                process.exit(1);
            }
            await db.overwrite({ colecao: 'veiculos', data: allItems });
            console.log(`✅ Finished. Fixed ${fixed} broken links.`);
        } else {
            console.log('No links needed fixing.');
        }
    } catch (err) {
        console.error('CRITICAL ERROR DURING MIGRATION:');
        console.error(err);
        process.exit(1);
    }
    process.exit(0);
}

migrateLinks();
