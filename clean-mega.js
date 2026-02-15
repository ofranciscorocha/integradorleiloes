import connectDatabase from './src/database/db.js';

async function cleanMega() {
    console.log("🧹 Cleaning Mega Leilões from DB...");
    const db = await connectDatabase();
    try {
        const collection = db.db.collection('veiculos');
        const countBefore = await collection.countDocuments({ site: 'megaleiloes.com.br' });
        console.log(`Found ${countBefore} documents from megaleiloes.com.br`);

        const result = await collection.deleteMany({ site: 'megaleiloes.com.br' });
        console.log(`✅ Deleted ${result.deletedCount} documents.`);

        // Also check if there are other names used for it
        const sites = await collection.distinct('site');
        console.log("Remaining sites in DB:", sites);

    } catch (e) {
        console.error("❌ Error:", e.message);
    } finally {
        await db.close();
    }
}

cleanMega();
