
import fs from 'fs';
import path from 'path';

const fix = () => {
    try {
        const filePath = 'C:/Users/Francisco/Desktop/PROJETOS/integradorleiloes/data/veiculos.json';
        console.log('📂 Verificando arquivo:', filePath);

        if (!fs.existsSync(filePath)) {
            console.log('❌ Arquivo JSON não encontrado no caminho:', filePath);
            return;
        }

        const raw = fs.readFileSync(filePath, 'utf-8');
        console.log('📄 Arquivo lido. Tamanho do texto:', raw.length);

        const data = JSON.parse(raw);
        console.log('📊 Total de veículos carregados:', data.length);

        const SITE = 'palaciodosleiloes.com.br';
        let count = 0;
        let palacioCount = 0;

        const newData = data.map((v) => {
            if (v.site === SITE) {
                palacioCount++;
                if (v.registro && typeof v.registro === 'string') {
                    const parts = v.registro.split('_');
                    if (parts.length >= 2) {
                        const leilaoId = parts[0];
                        const registroLote = parts[1];

                        // DEFINITIVE FORMAT: id_lote and id_leilao
                        const newLink = `https://www.palaciodosleiloes.com.br/site/?cl=${registroLote}&leilao=${leilaoId}`;

                        if (v.link !== newLink) {
                            count++;
                            return { ...v, link: newLink };
                        }
                    }
                }
            }
            return v;
        });

        console.log(`🔍 Veículos do Palácio identificados: ${palacioCount}`);

        if (count > 0) {
            fs.writeFileSync(filePath, JSON.stringify(newData, null, 2), 'utf-8');
            console.log(`✅ SUCESSO! ${count} links foram corrigidos.`);
        } else {
            console.log('ℹ️ Nenhum link precisava de correção (ou todos já estavam corretos).');
        }
    } catch (err) {
        console.error('💥 ERRO DURANTE A EXECUÇÃO:', err);
    }
};

fix();
