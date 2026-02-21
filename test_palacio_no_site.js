
import axios from 'axios';

const testUrls = async () => {
    const lotId = '1495761';
    const base = 'https://www.palaciodosleiloes.com.br';
    const paths = [
        `${base}/lote/${lotId}`,
        `${base}/lote/${lotId}/detalhes`,
        `${base}/item/${lotId}`,
        `${base}/item/${lotId}/detalhes`,
        `${base}/leilao/lote/exibir/${lotId}`,
        `${base}/index.php?opcao=exibir_lote&id_lote=${lotId}`
    ];

    for (const url of paths) {
        try {
            console.log(`Testing: ${url}`);
            const { status, request, data } = await axios.get(url, {
                headers: { 'User-Agent': 'Mozilla/5.0' },
                maxRedirects: 2,
                validateStatus: () => true
            });
            console.log(`   Status: ${status}`);
            if (data.includes('FORD/ECOSPORT')) {
                console.log(`   ✅ WORKS! Found vehicle name.`);
            }
        } catch (e) {
            console.log(`   Error: ${e.message}`);
        }
    }
};

testUrls();
