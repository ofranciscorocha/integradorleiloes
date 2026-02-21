import fs from 'fs';
import path from 'path';

const veiculosPath = 'data/veiculos.json';
if (fs.existsSync(veiculosPath)) {
    const data = JSON.parse(fs.readFileSync(veiculosPath, 'utf8'));
    const testVehicles = data.filter(v =>
        (v.veiculo && v.veiculo.toLowerCase().includes('teste')) ||
        (v.descricao && v.descricao.toLowerCase().includes('teste')) ||
        (v.veiculo && v.veiculo.toLowerCase().includes(' test ')) ||
        (v.descricao && v.descricao.toLowerCase().includes(' test ')) ||
        (v.site === 'test.com')
    );
    console.log(JSON.stringify(testVehicles.map(v => ({ registro: v.registro, site: v.site, veiculo: v.veiculo })), null, 2));
} else {
    console.log('File not found');
}
