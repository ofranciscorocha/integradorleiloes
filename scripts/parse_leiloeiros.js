import XLSX from 'xlsx';
import fs from 'fs';
import path from 'path';

const EXCEL_PATH = 'C:\\Users\\Francisco\\Downloads\\leiloeiros_brasil.xlsx';
const OUTPUT_PATH = './data/leiloeiros_extracted.json';

async function parseLeiloeiros() {
    console.log('📖 Iniciando leitura do arquivo Excel...');

    if (!fs.existsSync(EXCEL_PATH)) {
        console.error('❌ Arquivo não encontrado em:', EXCEL_PATH);
        return;
    }

    try {
        const workbook = XLSX.readFile(EXCEL_PATH);
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];

        // Use header: 1 to get raw array rows
        const rows = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

        console.log(`📊 Total de linhas lidas: ${rows.length}`);

        // Skip header row
        const dataRows = rows.slice(1);

        const processed = dataRows.map(row => {
            return {
                leiloeiro: row[0] || null,
                empresa: row[1] || null,
                site: row[2] || null,
                uf: row[3] || null
            };
        }).filter(item => {
            if (!item.site || item.site === '-') return false;

            // Normalize site
            let cleanSite = item.site.toLowerCase().trim();
            if (!cleanSite.startsWith('http')) {
                cleanSite = 'https://' + cleanSite;
            }
            item.site = cleanSite;

            // Simple domain extraction for filtering/dedup
            try {
                const url = new URL(cleanSite);
                item.domain = url.hostname.replace('www.', '');
            } catch (e) {
                item.domain = cleanSite.replace('https://', '').replace('http://', '').replace('www.', '').split('/')[0];
            }

            // Filtering for vehicles / Excluding obviously non-vehicle sites
            const blacklist = ['imoveis', 'imovel', 'casa', 'apartamento', 'terreno', 'rural', 'fazenda', 'arte', 'judicial', 'eletronico', 'moveis'];
            // Judicial often has vehicles, so we might keep it if it has vehicles.
            // But if the site name is "XYZ imoveis", we definitely skip.

            const nameLower = (item.empresa || '').toLowerCase();
            if (blacklist.some(term => nameLower.includes(term) && !nameLower.includes('veiculo'))) {
                return false;
            }

            return true;
        });

        // Deduplicate by domain AND leiloeiro name (if site is shared but leiloeiro is different)
        // Actually the user wants both. If multiple leiloeiros use the same site, we should probably record them.
        // But for crawling purposes, the domain is the key.

        const deduplicated = [];
        const seen = new Set();

        processed.forEach(item => {
            const key = `${item.domain}`;
            if (!seen.has(key)) {
                seen.add(key);
                deduplicated.push(item);
            } else {
                // If domain exists, maybe append leiloeiro to the existing list?
                const existing = deduplicated.find(d => d.domain === item.domain);
                if (existing && item.leiloeiro && !existing.leiloeiro.includes(item.leiloeiro)) {
                    existing.leiloeiro += ` / ${item.leiloeiro}`;
                }
            }
        });

        console.log(`✅ Filtro concluído: ${deduplicated.length} sites originais de leilões encontrados.`);

        if (!fs.existsSync('./data')) fs.mkdirSync('./data');
        fs.writeFileSync(OUTPUT_PATH, JSON.stringify(deduplicated, null, 2));
        console.log(`💾 Resultado salvo em: ${OUTPUT_PATH}`);

    } catch (error) {
        console.error('❌ Erro ao processar Excel:', error.message);
    }
}

parseLeiloeiros();
