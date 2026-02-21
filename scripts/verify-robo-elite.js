import { parseVehicleDetails } from '../src/utils/vehicle-parser.js';

async function verifyRoboElite() {
    console.log('🚀 Checking Robo Elite Extraction (The Deep Dive)...\n');

    const testCases = [
        {
            name: 'Complex Sinistro (VIP Pattern)',
            veiculo: 'LOTE 50 - HONDA CIVIC SEDAN EXL 2.0 (2019/2020)',
            specs: {
                'Observação': 'SINISTRO RECUPERADO DE ENCHENTE. DÉBITOS POR CONTA DO ARREMATANTE. LOCALIZACAO DA COLISAO: FRONTAL/LATERAL. CHASSI REM.',
                'Comitente': 'BANCO ITAU S/A',
                'Edital': 'https://leilao.com/edital_50.pdf'
            },
            expected: {
                origem: 'Enchente/Alagamento',
                debito: 'Arrematante',
                colisao: 'Frontal', // It picks the first match or handles hierarchy
                comitente: 'BANCO ITAU S/A',
                remarcado: true
            }
        },
        {
            name: 'Theft Recovery (Freitas Pattern)',
            veiculo: 'BMW 320I SPORT GP (2021/2022)',
            specs: {
                'Descrição': 'VEICULO DE ROUBO/FURTO. SEM CHAVE. IPVA PAGO PELO COMITENTE.',
                'Vendedor': 'PORTO SEGURO CIA DE SEGUROS'
            },
            expected: {
                origem: 'Roubo/Furto',
                debito: 'Comitente',
                comitente: 'PORTO SEGURO CIA DE SEGUROS'
            }
        }
    ];

    let passed = 0;

    for (const tc of testCases) {
        console.log(`📋 Testing: ${tc.name}`);
        // Simulate full string search like in parser
        const fullTxt = tc.veiculo + ' ' + Object.values(tc.specs).join(' ');
        const parsed = parseVehicleDetails(fullTxt, tc.specs);

        console.log(`   - Parsed Origem: ${parsed.origem}`);
        console.log(`   - Parsed Colisão: ${parsed.localColisao}`);
        console.log(`   - Parsed Debitos: ${parsed.debitoResponsabilidade}`);
        console.log(`   - Parsed Comitente: ${parsed.comitente}`);
        console.log(`   - Parsed Remarcado: ${parsed.remarcado}`);

        let currentPass = true;
        if (tc.expected.origem && parsed.origem !== tc.expected.origem) {
            console.error(`     ❌ Origem mismatch: expected "${tc.expected.origem}", got "${parsed.origem}"`);
            currentPass = false;
        }
        if (tc.expected.debito && parsed.debitoResponsabilidade !== tc.expected.debito) {
            console.error(`     ❌ Debito mismatch: expected "${tc.expected.debito}", got "${parsed.debitoResponsabilidade}"`);
            currentPass = false;
        }
        if (tc.expected.comitente && parsed.comitente !== tc.expected.comitente) {
            console.error(`     ❌ Comitente mismatch: expected "${tc.expected.comitente}", got "${parsed.comitente}"`);
            currentPass = false;
        }
        if (tc.expected.remarcado !== undefined && parsed.remarcado !== tc.expected.remarcado) {
            console.error(`     ❌ Remarcado mismatch: expected ${tc.expected.remarcado}, got ${parsed.remarcado}`);
            currentPass = false;
        }

        if (currentPass) {
            console.log('   ✅ Passed!');
            passed++;
        }
        console.log('------------------');
    }

    console.log(`🏁 Verification Result: ${passed}/${testCases.length} Passed`);
}

verifyRoboElite();
