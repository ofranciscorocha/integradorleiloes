import fs from 'fs';
import path from 'path';

const data = JSON.parse(fs.readFileSync('data/veiculos.json', 'utf8'));
const sites = {};

data.forEach(v => {
    sites[v.site] = (sites[v.site] || 0) + 1;
});

console.log('Sites no banco:', sites);
console.log('Total de veículos:', data.length);
