import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.join(__dirname, '../../data');
const FILE_PATH = path.join(DATA_DIR, 'veiculos.json');

const repair = () => {
    if (!fs.existsSync(FILE_PATH)) {
        console.error('❌ Arquivo veiculos.json não encontrado.');
        return;
    }

    const data = JSON.parse(fs.readFileSync(FILE_PATH, 'utf-8'));
    let corrected = 0;

    const mapping = [
        { pattern: 'palaciodosleiloes', site: 'palaciodosleiloes.com.br' },
        { pattern: 'sodresantoro', site: 'sodresantoro.com.br' },
        { pattern: 'freitasleiloeiro', site: 'freitasleiloeiro.com.br' },
        { pattern: 'rogeriomenezes', site: 'rogeriomenezes.com.br' },
        { pattern: 'guariglialeiloes', site: 'guariglialeiloes.com.br' },
        { pattern: 'vipleiloes', site: 'vipleiloes.com.br' },
        { pattern: 'parquedosleiloes', site: 'parquedosleiloes.com.br' },
        { pattern: 'copart', site: 'copart.com.br' },
        { pattern: 'leilo.com.br', site: 'leilo.com.br' }
    ];

    data.forEach(item => {
        const originalSite = item.site;
        const link = (item.link || '').toLowerCase();

        for (const map of mapping) {
            if (link.includes(map.pattern)) {
                if (item.site !== map.site) {
                    item.site = map.site;
                    corrected++;
                }
                break;
            }
        }
    });

    if (corrected > 0) {
        fs.writeFileSync(FILE_PATH, JSON.stringify(data, null, 2), 'utf-8');
        console.log(`✅ Reparo concluído! ${corrected} itens corrigidos.`);
    } else {
        console.log('ℹ️ Nenhum item precisava de correção.');
    }
};

repair();
