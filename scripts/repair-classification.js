import connectDatabase from '../src/database/db.js';
import { classifyVehicle } from '../src/utils/vehicle-parser.js';

async function repair() {
    console.log('🚀 Starting Optimized Classification Repair...');
    const db = await connectDatabase();

    try {
        const veiculos = await db.buscarLista({ colecao: 'veiculos' });
        console.log(`📊 Found ${veiculos.length} vehicles to process.`);

        let updatedCount = 0;
        let totalProcessed = 0;

        const repairedList = veiculos.map(v => {
            totalProcessed++;
            const currentTipo = v.tipo || 'outro';
            const newTipo = classifyVehicle(v.veiculo);

            if (newTipo !== currentTipo) {
                updatedCount++;
                return { ...v, tipo: newTipo };
            }
            return v;
        });

        if (updatedCount > 0) {
            console.log(`💾 Saving ${updatedCount} changes...`);
            await db.overwrite({ colecao: 'veiculos', data: repairedList });
            console.log('✅ Changes saved successfully.');
        } else {
            console.log('ℹ️ No changes needed.');
        }

        console.log('\n✨ Repair Finished!');
        console.log(`✅ Updated: ${updatedCount}`);
        console.log(`📝 Total processed: ${totalProcessed}`);

    } catch (error) {
        console.error('❌ Error during repair:', error);
    } finally {
        if (db.close) await db.close();
        process.exit(0);
    }
}

repair();
