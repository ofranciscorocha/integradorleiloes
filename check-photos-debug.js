import fs from 'fs';
const data = JSON.parse(fs.readFileSync('data/veiculos.json', 'utf8'));
const sites = {};
data.forEach(v => {
    if (!sites[v.site]) sites[v.site] = { total: 0, withPhotos: 0 };
    sites[v.site].total++;
    if (v.fotos && v.fotos.length > 0) sites[v.site].withPhotos++;
});
console.log('Photo coverage per site:', sites);
