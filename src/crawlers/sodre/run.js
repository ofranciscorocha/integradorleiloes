import { execute } from './index.js';
import connectDatabase from '../../database/db.js';

(async () => {
    try {
        const db = await connectDatabase();
        await execute(db);
        process.exit(0);
    } catch (error) {
        console.error('Erro crítico na execução do crawler:', error);
        process.exit(1);
    }
})();
