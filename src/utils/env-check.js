import dotenv from 'dotenv';
import { MongoClient } from 'mongodb';
dotenv.config();

console.log('🌍 [ENV CHECK] Diagnosticando ambiente...');
console.log('Platform:', process.platform);
console.log('Node Version:', process.version);
console.log('CWD:', process.cwd());

const mongoUri = process.env.MONGODB_URI || process.env.MONGODB_URL || process.env.MONGO_URL || process.env.DATABASE_URL;

if (mongoUri && mongoUri !== 'undefined' && mongoUri.startsWith('mongodb')) {
    const masked = mongoUri.replace(/\/\/.*?:.*?@/, '//***:***@');
    console.log('🧪 Testando conexão MongoDB:', masked);

    try {
        const client = new MongoClient(mongoUri, { serverSelectionTimeoutMS: 5000 });
        await client.connect();
        const db = client.db();
        const testCol = db.collection('_diagnostic');

        await testCol.updateOne(
            { id: 'railway_audit' },
            { $set: { lastCheck: new Date(), platform: process.platform, status: 'success' } },
            { upsert: true }
        );

        console.log('✅ DATABASE WRITE SUCCESS: MongoDB está operando corretamente.');
        await client.close();
    } catch (err) {
        console.log('❌ DATABASE WRITE FAILED:', err.message);
    }
} else {
    console.log('❌ MONGODB_URI NOT detected or INVALID format!');
}

console.log('CHROME_PATH:', process.env.CHROME_PATH || 'Not set');
console.log('PORT:', process.env.PORT || 'Not set');

const relevantVars = Object.keys(process.env).filter(key =>
    key.includes('MONGO') || key.includes('CRAWLER') || key.includes('PATH')
);

console.log('Relevant Vars found:', relevantVars.join(', '));
console.log('--- ENV CHECK END ---');
