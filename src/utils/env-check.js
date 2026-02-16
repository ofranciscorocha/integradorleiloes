import dotenv from 'dotenv';
dotenv.config();

console.log('🌍 [ENV CHECK] Diagnosticando ambiente...');
console.log('Platform:', process.platform);
console.log('Node Version:', process.version);
console.log('CWD:', process.cwd());

const mongoUri = process.env.MONGODB_URI;
if (mongoUri) {
    const masked = mongoUri.replace(/\/\/.*?:.*?@/, '//***:***@');
    console.log('✅ MONGODB_URI detected:', masked);
} else {
    console.log('❌ MONGODB_URI NOT detected!');
}

console.log('CHROME_PATH:', process.env.CHROME_PATH || 'Not set');
console.log('PORT:', process.env.PORT || 'Not set');

// List all BIP/CRAWLER specific vars
const relevantVars = Object.keys(process.env).filter(key =>
    key.includes('MONGO') || key.includes('CRAWLER') || key.includes('PATH')
);

console.log('Relevant Vars found:', relevantVars.join(', '));
console.log('--- ENV CHECK END ---');
