import axios from 'axios';

const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

async function testFormats() {
    const lotId = 1496180;
    const leilaoId = 8254;

    const formats = [
        `https://www.palaciodosleiloes.com.br/index.php?opcao=exibir_lote&id_lote=${lotId}&id_leilao=${leilaoId}`,
        `https://www.palaciodosleiloes.com.br/site/index.php?opcao=exibir_lote&id_lote=${lotId}&id_leilao=${leilaoId}`,
        `https://www.palaciodosleiloes.com.br/lote/detalhes/${lotId}`,
        `https://www.palaciodosleiloes.com.br/site/lote/detalhes/${lotId}/${leilaoId}`
    ];

    for (const url of formats) {
        try {
            console.log(`Testing: ${url}`);
            const res = await axios.get(url, {
                headers: { 'User-Agent': USER_AGENT },
                maxRedirects: 0,
                validateStatus: null
            });
            console.log(`Status: ${res.status}`);
            if (res.headers.location) console.log(`Redirects to: ${res.headers.location}`);

            if (res.status === 200) {
                // Check if it's the actual lot page
                const isLotPage = res.data.includes('detalhes_lote') || res.data.includes('id_lote') || res.data.includes('Geral');
                console.log(`Looks like lot page: ${isLotPage}`);
                if (isLotPage) {
                    console.log(`✅ FOUND STABLE FORMAT: ${url}`);
                }
            }
        } catch (e) {
            console.log(`Error: ${e.message}`);
        }
        console.log('---');
    }
}

testFormats();
