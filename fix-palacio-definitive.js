
import connectDatabase from './src/database/db.js';

async function runFix() {
    console.log('--- FIX PALACIO LINKS (EXIBIR_LOTE) ---');
    try {
        const { buscarLista, update } = await connectDatabase();
        const SITE = 'palaciodosleiloes.com.br';

        const items = await buscarLista({ colecao: 'veiculos' });
        console.log(`Verificando ${items.length} veículos...`);

        let count = 0;
        for (const v of items) {
            if (v.site === SITE) {
                let leilaoId, registroLote;

                if (typeof v.registro === 'string') {
                    const parts = v.registro.split('_');
                    leilaoId = parts[0];
                    registroLote = parts[1];
                } else if (v.registro && typeof v.registro === 'object') {
                    leilaoId = v.registro.leilao;
                    registroLote = v.registro.lote;
                }

                if (leilaoId && registroLote) {
                    const newLink = `https://www.palaciodosleiloes.com.br/site/?opcao=exibir_lote&id_lote=${registroLote}&id_leilao=${leilaoId}`;

                    if (v.link !== newLink) {
                        count++;
                        // Use original registro as key for update
                        await update({
                            colecao: 'veiculos',
                            registro: v.registro,
                            site: SITE,
                            set: { link: newLink }
                        });
                    }
                }
            }
        }

        console.log(`SUCESSO: ${count} links do Palácio atualizados.`);
        process.exit(0);
    } catch (e) {
        console.error('ERRO:', e);
        process.exit(1);
    }
}

runFix();
