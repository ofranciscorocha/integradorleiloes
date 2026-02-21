
import connectDatabase from '../database/db.js';
import { shouldCleanStatus } from '../utils/status.js';

const runCleanup = async () => {
    console.log('🧹 Iniciando limpeza de dados (Auto-Cleanup)...');

    const db = await connectDatabase();

    try {
        // 1. Remove items without photos (Safety net)
        const removedNoPhotos = await db.deleteItems({
            colecao: 'veiculos',
            filtro: {
                $or: [
                    { fotos: { $exists: false } },
                    { fotos: { $size: 0 } },
                    { "fotos.0": { $exists: false } }
                ]
            }
        });
        if (removedNoPhotos > 0) {
            console.log(`📸 Removidos ${removedNoPhotos} veículos sem fotos.`);
        }

        // 2. Remove items with status "Vendido" or "Encerrado"
        // Since we standardized the status, we can filter for these specific values
        const removedSold = await db.deleteItems({
            colecao: 'veiculos',
            filtro: {
                situacao: { $in: ['Vendido', 'Encerrado'] }
            }
        });
        if (removedSold > 0) {
            console.log(`✅ Removidos ${removedSold} veículos com status Vendido/Encerrado.`);
        }

        // 3. For site-specific cleanup logic (e.g. ended auctions that don't have a standardized status yet)
        const items = await db.list({ colecao: 'veiculos' });
        const oldItemsCount = items.length;

        // Final summary
        console.log(`✨ Limpeza concluída. Total no banco: ${oldItemsCount - removedNoPhotos - removedSold}`);

    } catch (e) {
        console.error('❌ Erro durante o cleanup:', e.message);
    } finally {
        await db.close();
    }
};

// Run if called directly
if (import.meta.url.endsWith(process.argv[1])) {
    runCleanup();
}

export default runCleanup;
