import XLSX from 'xlsx';
import fs from 'fs';

const EXCEL_PATH = 'C:\\Users\\Francisco\\Downloads\\leiloeiros_brasil.xlsx';
const OUTPUT_PATH = './data/inspect_result.json';

function inspectExcel() {
    if (!fs.existsSync(EXCEL_PATH)) {
        console.error('❌ Arquivo não encontrado');
        return;
    }

    const workbook = XLSX.readFile(EXCEL_PATH);
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];

    // Get headers and first 10 rows
    const data = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
    const preview = data.slice(0, 10);

    if (!fs.existsSync('./data')) fs.mkdirSync('./data');
    fs.writeFileSync(OUTPUT_PATH, JSON.stringify(preview, null, 2));
    console.log(`💾 Preview salvo em: ${OUTPUT_PATH}`);
}

inspectExcel();
