import fs from 'fs';
import path from 'path';

const veiculosPath = 'data/veiculos.json';
if (fs.existsSync(veiculosPath)) {
    const data = JSON.parse(fs.readFileSync(veiculosPath, 'utf8'));
    const initialCount = data.length;

    const filteredData = data.filter(v => {
        const isTestName = v.veiculo && (v.veiculo.toLowerCase().includes('teste') || v.veiculo.toLowerCase().includes(' test '));
        const isTestDesc = v.descricao && (v.descricao.toLowerCase().includes('teste') || v.descricao.toLowerCase().includes(' test '));
        const isTestSite = v.site === 'test.com';
        const isMktTest = v.veiculo && v.veiculo.toLowerCase().startsWith('teste ');

        return !(isTestName || isTestDesc || isTestSite || isMktTest);
    });

    if (initialCount !== filteredData.length) {
        fs.writeFileSync(veiculosPath, JSON.stringify(filteredData, null, 2), 'utf8');
        console.log(`✅ Sucesso! ${initialCount - filteredData.length} veículos de teste foram removidos.`);
    } else {
        console.log('ℹ️ Nenhum veículo de teste encontrado.');
    }
} else {
    console.log('❌ Arquivo data/veiculos.json não encontrado.');
}
