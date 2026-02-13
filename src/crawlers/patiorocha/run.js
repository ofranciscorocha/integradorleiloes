import { execute } from './index.js';
import connectDatabase from '../../database/db.js';

(async () => {
    try {
        console.log('🚀 Iniciando Crawler Pátio Rocha...');
        const db = await connectDatabase();
        await execute(db);
        await db.close();
        process.exit(0);
    } catch (error) {
        console.error('❌ Erro no Pátio Rocha:', error);
        process.exit(1);
    }
})();
