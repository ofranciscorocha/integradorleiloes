const test = async () => {
    try {
        console.log('Testing /stats...');
        const statsRes = await fetch('http://localhost:8181/stats');
        const stats = await statsRes.json();
        console.log('Stats:', JSON.stringify(stats, null, 2));

        console.log('\nTesting /veiculos...');
        const veiculosRes = await fetch('http://localhost:8181/veiculos?limit=5');
        const veiculos = await veiculosRes.json();
        if (veiculos.success) {
            console.log('Veiculos Total:', veiculos.pagination.total);
            console.log('Veiculos Sample (Sites):', veiculos.items.map(i => i.site));
        } else {
            console.log('Veiculos Failed:', veiculos);
        }
    } catch (e) {
        console.error('Error connecting to API:', e.message);
    }
};

test();
