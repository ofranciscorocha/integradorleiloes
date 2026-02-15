import { readFileSync } from 'fs';
import path from 'path';

const dbPath = path.join(process.cwd(), 'data/veiculos.json');
try {
    const veiculos = JSON.parse(readFileSync(dbPath, 'utf8'));
    const counts = {};
    veiculos.forEach(v => {
        counts[v.site] = (counts[v.site] || 0) + 1;
    });

    console.log(JSON.stringify(counts, null, 2));
} catch (e) {
    console.error('Error:', e.message);
}
