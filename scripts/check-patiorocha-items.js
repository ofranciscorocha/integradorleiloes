
import connectDatabase from '../src/database/db.js';
import fs from 'fs';

(async () => {
    try {
        const db = await connectDatabase();
        // Use 'list' which supports basic filtering in JSON mode
        const items = await db.list({
            colecao: 'veiculos',
            filtro: { site: 'patiorochaleiloes.com.br' }
        });

        console.log(`Encontrados ${items.length} itens do Pátio Rocha.`);

        let output = `Encontrados ${items.length} itens do Pátio Rocha.\n\n`;

        // Sort by creation date (descending) explicitly if not already
        items.sort((a, b) => new Date(b.criadoEm) - new Date(a.criadoEm));

        const lastItems = items.slice(0, 50); // Get top 50 most recent

        lastItems.forEach((item, index) => {
            output += `#${index + 1}\n`;
            output += `   ID: ${item._id}\n`;
            output += `   Registro: ${item.registro}\n`;
            output += `   Veículo: ${item.veiculo}\n`;
            output += `   Valor: ${item.valor} | Ano: ${item.ano}\n`;
            output += `   Link: ${item.link}\n`;
            output += `   CriadoEm: ${item.criadoEm}\n`;
            output += '---------------------------------------------------\n';
        });

        fs.writeFileSync('debug_patiorocha.txt', output);
        console.log('Output salvo em debug_patiorocha.txt');

        await db.close();
    } catch (error) {
        console.error('Erro:', error);
    }
})();
