import { readFileSync, readdirSync } from 'fs';
import path from 'path';

const dataDir = path.join(process.cwd(), 'data');
const files = readdirSync(dataDir).filter(f => f.endsWith('.json'));

let total = 0;
const counts = {};

files.forEach(file => {
    try {
        const content = JSON.parse(readFileSync(path.join(dataDir, file), 'utf8'));
        const site = file.replace('.json', '');
        const count = content.length || 0;
        counts[site] = count;
        total += count;
    } catch (e) {
        console.error(`Error reading ${file}: ${e.message}`);
    }
});

console.log('--- VEHICLE COUNTS ---');
Object.entries(counts).sort((a, b) => b[1] - a[1]).forEach(([site, count]) => {
    console.log(`${site.padEnd(25)}: ${count}`);
});
console.log('---------------------');
console.log(`TOTAL: ${total}`);
