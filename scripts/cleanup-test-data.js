import connectDatabase from '../src/database/db.js';

const cleanup = async () => {
    console.log('🧹 Iniciando limpeza de dados de teste...');
    const db = await connectDatabase();

    try {
        // 1. Remove by exact site name
        const removedTestSite = await db.deleteBySite({ site: 'test-site' });
        console.log(`✅ Removidos ${removedTestSite} veículos do site 'test-site'`);

        // 2. Remove items with "TEST" in the name or registration (common in my diagnostic runs)
        const removedDiagnostic = await db.deleteItems({
            colecao: 'veiculos',
            filtro: {
                $or: [
                    { veiculo: { $regex: 'TEST', $options: 'i' } },
                    { registro: { $regex: 'TEST', $options: 'i' } }
                ]
            }
        });
        console.log(`✅ Removidos ${removedDiagnostic} veículos de diagnóstico (com termo TEST)`);

    } catch (e) {
        console.error('❌ Erro durante a limpeza:', e.message);
    } finally {
        console.log('🏁 Limpeza finalizada.');
        process.exit(0);
    }
};

cleanup();
