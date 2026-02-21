
import axios from 'axios';

const BASE_URL = 'http://localhost:8181';

async function testMarketplace() {
    console.log('--- TESTING MARKETPLACE ---');

    try {
        // 1. Test Announcement
        console.log('1. Testing /marketplace/announce...');
        const announceRes = await axios.post(`${BASE_URL}/marketplace/announce`, {
            veiculo: 'Test Corolla 2024',
            ano: '2024',
            valor: '150000',
            cor: 'Preto',
            combustivel: 'Flex',
            descricao: 'Veículo de teste para marketplace integration.',
            fotos: 'https://placehold.co/600x400?text=Corolla+Teste',
            localizacao: 'São Paulo - SP',
            whatsapp: '11999999999',
            email: 'test@example.com',
            nomeVendedor: 'Test User'
        });

        if (announceRes.data.success) {
            console.log('✅ Announcement successful:', announceRes.data.anuncio.registro);
        } else {
            console.error('❌ Announcement failed:', announceRes.data.error);
        }

        // 2. Test Search
        console.log('\n2. Testing /marketplace/search...');
        const searchRes = await axios.get(`${BASE_URL}/marketplace/search?search=Corolla`);

        if (searchRes.data.success) {
            console.log(`✅ Search successful! Found ${searchRes.data.items.length} items.`);
            const item = searchRes.data.items[0];
            console.log(`First item: ${item.veiculo} - Site: ${item.site}`);
        } else {
            console.error('❌ Search failed:', searchRes.data.error);
        }

        // 3. Test Profile Integration
        console.log('\n3. Testing /perfil with announcements...');
        const profileRes = await axios.get(`${BASE_URL}/perfil?email=test@example.com`);

        if (profileRes.data.success) {
            console.log(`✅ Profile retrieved. Announcements count: ${profileRes.data.stats.anuncios}`);
        } else {
            console.error('❌ Profile failed:', profileRes.data.error);
        }

    } catch (e) {
        console.error('❌ Error during test:', e.message);
    }
}

testMarketplace();
