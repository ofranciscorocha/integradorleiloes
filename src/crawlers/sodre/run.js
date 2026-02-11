import { execute } from './index.js';
import connectDatabase from '../../database/db.js';

(async () => {
    try {
        const db = await connectDatabase();
        await execute(db);
    } catch (error) {
        console.error('Erro ao executar crawler:', error);
    }
})();
