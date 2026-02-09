import axios from 'axios';
import fs from 'fs';

const dump = async () => {
    try {
        const { data } = await axios.get(
            'https://www.vipleiloes.com.br/Veiculos/ListarVeiculos?Pagina=1&OrdenacaoVeiculo=InicioLeilao&Financiavel=False&Favoritos=False',
            {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
                }
            }
        );
        fs.writeFileSync('dump-vip.html', data);
        console.log('HTML salvo em dump-vip.html');
    } catch (e) {
        console.error(e);
    }
};
dump();
