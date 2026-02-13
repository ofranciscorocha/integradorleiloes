import fs from 'fs';
import path from 'path';

const filePath = path.join(process.cwd(), 'data', 'veiculos.json');
if (!fs.existsSync(filePath)) {
    console.error('File not found:', filePath);
    process.exit(1);
}

const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));

console.log(`TOTAL VEHICLES IN DB: ${data.length}`);

const distribution = {};
data.forEach(item => {
    const site = item.site || 'unknown';
    distribution[site] = (distribution[site] || 0) + 1;
});

console.log('\n--- DISTRIBUTION BY SITE ---');
Object.entries(distribution).sort((a, b) => b[1] - a[1]).forEach(([site, count]) => {
    console.log(`${site.padEnd(30)}: ${count}`);
});
