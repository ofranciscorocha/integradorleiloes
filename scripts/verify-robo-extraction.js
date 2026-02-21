import { cleanTitle, parseVehicleDetails } from '../src/utils/vehicle-parser.js';

async function verifyRoboStandards() {
    console.log('🚀 Checking Robo Standards Extraction...\n');

    const testCases = [
        {
            name: 'VIP Case (Complex Title + Specs)',
            veiculo: 'VW - VOLKSWAGEN GOL 1.0L MC4 (2020/2021) LOTE 123',
            specs: { 'Câmbio': 'Manual', 'Cor': 'Branco', 'Combustível': 'Flex', 'KM': '12.345' },
            expected: {
                title: 'VW VOLKSWAGEN GOL 1.0L',
                year: '2020/2021',
                fuel: 'Flex',
                km: 12345
            }
        },
        {
            name: 'Freitas Case (Condition + Key in Desc)',
            veiculo: 'FIAT STRADA FREEDOM 1.3 (2022/2022)',
            specs: { 'Condição': 'MEDIA MONTA', 'Observação': 'SEM CHAVE, SINISTRADO' },
            expected: {
                title: 'FIAT STRADA FREEDOM 1.3',
                condition: 'Média Monta',
                key: false
            }
        },
        {
            name: 'Palácio Case (Date and Precise Year)',
            veiculo: 'TOYOTA COROLLA XEI 2.0 (2023)',
            specs: { 'Leilão': '25/02/2026 14:30', 'Pátio': 'Belo Horizonte - MG' },
            expected: {
                title: 'TOYOTA COROLLA XEI 2.0',
                year: '2023'
            }
        },
        {
            name: 'Guariglia Case (Financing + Key)',
            veiculo: 'JEEP COMPASS LONGITUDE (2021/2021)',
            specs: { 'Info': 'FINANCIAMENTO - COM CHAVE' },
            expected: {
                title: 'JEEP COMPASS LONGITUDE',
                condition: 'Financiamento',
                key: true
            }
        }
    ];

    let passed = 0;

    for (const tc of testCases) {
        console.log(`📋 Testing: ${tc.name}`);
        const cleanedTitle = cleanTitle(tc.veiculo);
        const parsed = parseVehicleDetails(tc.veiculo, tc.specs);

        console.log(`   - Raw Title: ${tc.veiculo}`);
        console.log(`   - Clean Title: ${cleanedTitle}`);
        console.log(`   - Parsed:`, JSON.stringify(parsed, null, 2));

        let currentPass = true;
        if (tc.expected.title && cleanedTitle !== tc.expected.title) {
            console.error(`     ❌ Title mismatch: expected "${tc.expected.title}", got "${cleanedTitle}"`);
            currentPass = false;
        }
        if (tc.expected.year && parsed.ano !== tc.expected.year) {
            console.error(`     ❌ Year mismatch: expected "${tc.expected.year}", got "${parsed.ano}"`);
            currentPass = false;
        }
        if (tc.expected.condition && parsed.condicao !== tc.expected.condition) {
            console.error(`     ❌ Condition mismatch: expected "${tc.expected.condition}", got "${parsed.condicao}"`);
            currentPass = false;
        }
        if (tc.expected.key !== undefined && parsed.chave !== tc.expected.key) {
            console.error(`     ❌ Key mismatch: expected ${tc.expected.key}, got ${parsed.chave}`);
            currentPass = false;
        }

        if (currentPass) {
            console.log('   ✅ Passed!');
            passed++;
        }
        console.log('------------------');
    }

    console.log(`🏁 Verification Result: ${passed}/${testCases.length} Passed`);

    // Check Date format consistency
    const dateSample = "25/02/2026 14:30";
    const match = dateSample.match(/(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2})/);
    const iso = `${match[3]}-${match[2]}-${match[1]}T${match[4]}:${match[5]}:00`;
    console.log(`📅 ISO Date for Countdown: ${iso}`);
}

verifyRoboStandards();
