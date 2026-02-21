import fs from 'fs';
import path from 'path';

const DATA_PATH = 'c:/Users/Francisco/Desktop/PROJETOS/integradorleiloes/data/veiculos.json';

async function migrateDirect() {
    try {
        console.log(`Reading ${DATA_PATH}...`);
        if (!fs.existsSync(DATA_PATH)) {
            console.error('Data file not found!');
            process.exit(1);
        }

        const raw = fs.readFileSync(DATA_PATH, 'utf-8');
        const items = JSON.parse(raw);
        console.log(`Loaded ${items.length} items.`);

        const SITE = 'palaciodosleiloes.com.br';
        let fixed = 0;

        for (const v of items) {
            if (v.site === SITE && v.link && v.link.includes('lote/index.php')) {
                const [leilaoId, registroLote] = v.registro.split('_');
                if (leilaoId && registroLote) {
                    v.link = `https://www.palaciodosleiloes.com.br/site/?opcao=exibir_lote&id_lote=${registroLote}&id_leilao=${leilaoId}`;
                    fixed++;
                }
            }
        }

        if (fixed > 0) {
            console.log(`Saving ${fixed} fixed links...`);
            fs.writeFileSync(DATA_PATH, JSON.stringify(items, null, 2), 'utf-8');
            console.log('✅ Migration completed successfully.');
        } else {
            console.log('No links needed fixing.');
        }

    } catch (err) {
        console.error('Migration failed:', err);
        process.exit(1);
    }
}

migrateDirect();
