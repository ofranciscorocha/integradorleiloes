import fs from 'fs';
const data = JSON.parse(fs.readFileSync('data/veiculos.json', 'utf8'));

// Check Palacio samples
const palacio = data.filter(v => v.site.includes('palacio')).slice(0, 3);
console.log('--- PALACIO SAMPLE ---');
console.log(JSON.stringify(palacio, null, 2));

// Check Sodre samples
const sodre = data.filter(v => v.site.includes('sodre')).slice(0, 3);
console.log('--- SODRE SAMPLE ---');
console.log(JSON.stringify(sodre, null, 2));

// Check Rogerio Menezes (should be empty based on previous check, but verifying)
const rogerio = data.filter(v => v.site.includes('rogerio'));
console.log('--- ROGERIO ---', rogerio.length);
