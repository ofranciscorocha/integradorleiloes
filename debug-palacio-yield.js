import axios from 'axios';
import fs from 'fs';
import qs from 'qs';

async function debugPalacio() {
    const url = 'https://www.palaciodosleiloes.com.br/site/camada_ajax/coluna_esquerda_m.php?quebra=0.6543214025681199&&opcao=listar_lote&categoria_pesquisa=1&tipo_exibicao=grid&paginacao=-1';

    const body = {
        opcao: 'listar_lote',
        categoria_pesquisa: '1',
        tipo_exibicao: 'grid',
        paginacao: '-1'
    };

    console.log("📨 Sending AJAX request to Palácio...");
    try {
        const { data } = await axios.post(url, qs.stringify(body), {
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
                'Referer': 'https://www.palaciodosleiloes.com.br/',
                'X-Requested-With': 'XMLHttpRequest'
            }
        });

        fs.writeFileSync('debug-palacio.html', data);
        console.log("📄 HTML saved to debug-palacio.html. Length:", data.length);
    } catch (e) {
        console.error("❌ Error:", e.message);
        if (e.response) {
            fs.writeFileSync('debug-palacio-error.html', e.response.data);
            console.log("Error body saved to debug-palacio-error.html");
        }
    }
}

debugPalacio();
