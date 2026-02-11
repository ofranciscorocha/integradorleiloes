import connectDatabase from '../database/db.js';

export const checkAlerts = async () => {
    console.log('🔍 [Alerts] Checking for matches...');
    try {
        const db = await connectDatabase();
        const alerts = await db.getAlerts();

        if (!alerts || alerts.length === 0) {
            console.log('   No active alerts found.');
            return;
        }

        // Get vehicles from the last 24h (approximate "new" items)
        const now = new Date();
        const past24h = new Date(now.getTime() - (24 * 60 * 60 * 1000));

        const allVehicles = await db.list({ colecao: 'veiculos' });
        const newVehicles = allVehicles.filter(v => new Date(v.criadoEm || 0) > past24h);

        if (newVehicles.length === 0) {
            console.log('   No new vehicles found in the last 24h.');
            return;
        }

        console.log(`   Analyzing ${newVehicles.length} new vehicles against ${alerts.length} alerts...`);

        for (const alert of alerts) {
            const keyword = alert.veiculo.toLowerCase();
            const matches = newVehicles.filter(v => {
                const titleMatch = v.veiculo.toLowerCase().includes(keyword);
                const priceMatch = !alert.valorMax || (v.valor && v.valor <= alert.valorMax);
                return titleMatch && priceMatch;
            });

            if (matches.length > 0) {
                console.log(`\n📱 [WhatsApp Alert] Match found for ${alert.veiculo} (${alert.whatsapp})!`);
                for (const m of matches) {
                    console.log(`   -> NOTIFYING: "${m.veiculo}" @ ${m.site} - R$ ${m.valor}`);
                    // Simulação de envio de WhatsApp:
                    // EnviarMensagem(alert.whatsapp, `Olá! Encontramos um ${m.veiculo} no leilão ${m.site}. Confira aqui: ${m.link}`);
                }
            }
        }

    } catch (e) {
        console.error('Erro ao verificar alertas:', e);
    }
};

if (process.argv[1].includes('checkAlerts')) {
    checkAlerts();
}

export default checkAlerts;
