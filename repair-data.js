import connectDatabase from './src/database/db.js';

/**
 * Repair script: Fix existing DB records
 * 1. Guariglia: Remove "Marca/Modelo" prefix from vehicle names
 * 2. Copart: Fix localLeilao that contains vehicle model instead of pátio
 */

async function repairData() {
    const db = await connectDatabase();

    console.log('🔧 Iniciando reparo de dados...\n');

    // ===== 1. Fix Guariglia "Marca/Modelo" prefix =====
    console.log('--- Guariglia: Removendo prefixo "Marca/Modelo" ---');
    try {
        if (db.collection) {
            // MongoDB mode
            const col = db.collection('veiculos');

            // Find Guariglia records with "Marca/Modelo" in vehicle name
            const guarigliaDocs = await col.find({
                site: 'guariglialeiloes.com.br',
                veiculo: { $regex: /marca\s*\/?\s*modelo/i }
            }).toArray();

            console.log(`   Encontrados ${guarigliaDocs.length} registros Guariglia com prefixo`);

            for (const doc of guarigliaDocs) {
                const oldName = doc.veiculo;
                const newName = oldName.replace(/marca\s*\/?\s*modelo\s*:?\s*/gi, '').trim();
                if (newName !== oldName && newName.length > 1) {
                    await col.updateOne({ _id: doc._id }, { $set: { veiculo: newName } });
                }
            }
            console.log(`   ✅ ${guarigliaDocs.length} registros Guariglia corrigidos`);

            // ===== 2. Fix Copart localLeilao (has model name instead of pátio) =====
            console.log('\n--- Copart: Corrigindo campo localLeilao ---');
            const copartDocs = await col.find({ site: 'copart.com.br' }).toArray();
            console.log(`   Encontrados ${copartDocs.length} registros Copart`);

            let copartFixed = 0;
            for (const doc of copartDocs) {
                const local = doc.localLeilao || '';
                // If localLeilao looks like a vehicle model (short name, uppercase, no state/city indicators)
                // then it's wrong - reset to 'Brasil' 
                const looksLikeModel = local.length > 0 && local.length < 30 &&
                    !local.includes(' - ') && !local.includes('/') &&
                    local !== 'Brasil' &&
                    !/(SP|RJ|MG|PR|SC|RS|BA|GO|DF|CE|PE|PA|AM|MA|MT|MS|ES|PB|RN|AL|SE|PI|TO|RO|AC|AP|RR)/.test(local);

                if (looksLikeModel) {
                    await col.updateOne({ _id: doc._id }, { $set: { localLeilao: 'Brasil' } });
                    copartFixed++;
                }
            }
            console.log(`   ✅ ${copartFixed} registros Copart corrigidos`);

        } else if (db.salvarLista && db.buscarTodos) {
            // JSON fallback mode
            const todos = await db.buscarTodos();
            let modified = false;

            for (const item of todos) {
                // Fix Guariglia
                if (item.site === 'guariglialeiloes.com.br' && /marca\s*\/?\s*modelo/i.test(item.veiculo || '')) {
                    item.veiculo = item.veiculo.replace(/marca\s*\/?\s*modelo\s*:?\s*/gi, '').trim();
                    modified = true;
                }

                // Fix Copart localLeilao
                if (item.site === 'copart.com.br') {
                    const local = item.localLeilao || '';
                    if (local.length > 0 && local.length < 30 && local !== 'Brasil' &&
                        !local.includes(' - ') && !local.includes('/') &&
                        !/(SP|RJ|MG|PR|SC|RS|BA|GO|DF|CE|PE|PA|AM|MA|MT|MS|ES|PB|RN|AL|SE|PI|TO|RO|AC|AP|RR)/.test(local)) {
                        item.localLeilao = 'Brasil';
                        modified = true;
                    }
                }
            }

            if (modified) {
                await db.salvarLista(todos);
                console.log('   ✅ Registros corrigidos (JSON mode)');
            }
        }
    } catch (e) {
        console.error('❌ Erro no reparo:', e.message);
    }

    console.log('\n🏁 Reparo concluído!');
    process.exit(0);
}

repairData().catch(console.error);
