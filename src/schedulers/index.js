import cron from 'node-cron';
import dotenv from 'dotenv';
import connectDatabase from '../database/db.js';
import createPalacioCrawler from '../crawlers/palaciodosleiloes/index.js';
import createVipCrawler from '../crawlers/vipleiloes/index.js';
import createGuarigliaCrawler from '../crawlers/guariglialeiloes/index.js';

dotenv.config();

console.log('🚀 Iniciando agendador de crawlers...\n');

const DELAY = parseInt(process.env.CRAWLER_DELAY_MS) || 5000;

let db = null;
let palacio = null;
let vip = null;
let guariglia = null;

const init = async () => {
    db = await connectDatabase();
    palacio = createPalacioCrawler(db);
    vip = createVipCrawler(db);
    guariglia = createGuarigliaCrawler(db);

    console.log('✅ Todos os crawlers inicializados!\n');
};

// ========== SCHEDULES ==========

/**
 * Palácio dos Leilões - Busca de novos lotes
 * Executa 2x ao dia: 7h e 19h
 */
const schedulePalacio = () => {
    cron.schedule('0 7,19 * * *', async () => {
        console.log(`\n⏰ [${new Date().toLocaleString()}] Executando: Palácio dos Leilões`);
        try {
            await palacio.buscarESalvar();
        } catch (error) {
            console.error('❌ Erro no crawler Palácio:', error.message);
        }
    }, {
        scheduled: true,
        timezone: "America/Sao_Paulo"
    });

    console.log('📅 Palácio dos Leilões: Agendado para 7h e 19h');
};

/**
 * VIP Leilões - Busca de novos lotes
 * Executa 2x ao dia: 8h e 20h
 */
const scheduleVip = () => {
    cron.schedule('0 8,20 * * *', async () => {
        console.log(`\n⏰ [${new Date().toLocaleString()}] Executando: VIP Leilões`);
        try {
            await vip.buscarTodasPaginas(DELAY);
        } catch (error) {
            console.error('❌ Erro no crawler VIP:', error.message);
        }
    }, {
        scheduled: true,
        timezone: "America/Sao_Paulo"
    });

    console.log('📅 VIP Leilões: Agendado para 8h e 20h');
};

/**
 * Guariglia Leilões - Busca de novos lotes
 * Executa 2x ao dia: 9h e 21h
 */
const scheduleGuariglia = () => {
    cron.schedule('0 9,21 * * *', async () => {
        console.log(`\n⏰ [${new Date().toLocaleString()}] Executando: Guariglia Leilões`);
        try {
            await guariglia.buscarTodos();
        } catch (error) {
            console.error('❌ Erro no crawler Guariglia:', error.message);
        }
    }, {
        scheduled: true,
        timezone: "America/Sao_Paulo"
    });

    console.log('📅 Guariglia Leilões: Agendado para 9h e 21h');
};

// ========== MANUAL EXECUTION ==========

/**
 * Executa todos os crawlers uma vez
 */
const executarTodos = async () => {
    console.log('\n🔄 Executando todos os crawlers...\n');

    console.log('1️⃣ Palácio dos Leilões');
    await palacio.buscarESalvar();

    console.log('\n2️⃣ VIP Leilões');
    await vip.buscarTodasPaginas(DELAY);

    console.log('\n3️⃣ Guariglia Leilões');
    await guariglia.buscarTodos();

    console.log('\n✅ Todos os crawlers executados!');
};

// ========== START ==========

const start = async () => {
    await init();

    // Se receber argumento --run, executa todos os crawlers e sai
    if (process.argv.includes('--run')) {
        await executarTodos();
        await db.close();
        process.exit(0);
    }

    // Caso contrário, inicia agendamentos
    schedulePalacio();
    scheduleVip();
    scheduleGuariglia();

    console.log('\n✅ Agendador iniciado! Aguardando horários programados...');
    console.log('💡 Use Ctrl+C para parar\n');
};

start().catch(console.error);
