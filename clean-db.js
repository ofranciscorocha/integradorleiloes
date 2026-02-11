import fs from 'fs';
import path from 'path';

const DB_PATH = path.resolve('data/veiculos.json');

const clean = () => {
    if (!fs.existsSync(DB_PATH)) {
        console.log('Database not found.');
        return;
    }

    const raw = fs.readFileSync(DB_PATH, 'utf-8');
    let data = JSON.parse(raw);
    const initialCount = data.length;

    data = data.filter(item => {
        // Filter Logic
        const hasPhotos = item.fotos && item.fotos.length > 0;
        const validTitle = item.veiculo && !item.veiculo.includes('Veículo Sodré') && !item.veiculo.match(/^\d{2}\/\d{2}/); // No "Veículo Sodré" or date-titles

        return hasPhotos && validTitle;
    });

    const removed = initialCount - data.length;
    fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2));
    console.log(`🧹 Cleaned Database. Removed ${removed} invalid items. Remaining: ${data.length}`);
};

clean();
