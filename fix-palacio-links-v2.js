
import connectDatabase from './src/database/db.js';
import dotenv from 'dotenv';
dotenv.config();

const fixPalacioLinks = async () => {
    console.log('🔗 Iniciando correção DEFINITIVA de links do Palácio...');
    const db = await connectDatabase();

    try {
        const SITE = 'palaciodosleiloes.com.br';
        const todosVeiculos = await db.buscarLista({ colecao: 'veiculos' });
        const veiculos = todosVeiculos.filter(v => v.site === SITE);

        console.log(`🔍 Analisando ${veiculos.length} veículos do Palácio.`);

        let count = 0;
        for (const v of veiculos) {
            // Registro format is leilaoId_registroLote
            const parts = v.registro.split('_');
            if (parts.length === 2) {
                const [leilaoId, registroLote] = parts;
                const newLink = `https://www.palaciodosleiloes.com.br/site/lote.php?id_lote=${registroLote}&id_leilao=${leilaoId}`;

                if (v.link !== newLink) {
                    await db.update({
                        colecao: 'veiculos',
                        registro: v.registro,
                        site: SITE,
                        set: { link: newLink }
                    });
                    count++;
                }
            }
        }

        console.log(`✅ Sucesso! ${count} links foram atualizados para o formato id_lote/id_leilao.`);

    } catch (e) {
        console.error('❌ Erro ao corrigir links:', e);
    } finally {
        if (db.close) await db.close();
        process.exit(0);
    }
};

fixPalacioLinks();
