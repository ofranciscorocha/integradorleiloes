import cron from 'node-cron';
import dotenv from 'dotenv';
import connectDatabase from '../database/db.js';
import createPalacioCrawler from '../crawlers/palaciodosleiloes/index.js';
import createVipCrawler from '../crawlers/vipleiloes/index.js';
import createGuarigliaCrawler from '../crawlers/guariglialeiloes/index.js';
import createRogerioMenezesCrawler from '../crawlers/rogeriomenezes/index.js';
import createLeiloCrawler from '../crawlers/leilo/index.js';
import { execute as executeFreitas } from '../crawlers/freitas/index.js';
import { execute as executeSodre } from '../crawlers/sodre/index.js';
import copart from '../crawlers/copart/index.js';
import cleanExpired from '../tasks/cleanExpired.js';

dotenv.config();

console.log('🚀 Iniciando agendador de crawlers...\n');

const DELAY = parseInt(process.env.CRAWLER_DELAY_MS) || 5000;

let db = null;
let palacio = null;
let vip = null;
let guariglia = null;
let rogerioMenezes = null;
let leilo = null;

const init = async () => {
    db = await connectDatabase();
    palacio = createPalacioCrawler(db);
    vip = createVipCrawler(db);
    guariglia = createGuarigliaCrawler(db);
    rogerioMenezes = createRogerioMenezesCrawler(db);
    leilo = createLeiloCrawler(db);

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

const scheduleFreitas = () => {
    cron.schedule('0 10,22 * * *', async () => {
        console.log(`\n⏰ Executando: Freitas Leiloeiro`);
        try { await executeFreitas(db); } catch (e) { console.error('Erro Freitas:', e.message); }
    }, { scheduled: true, timezone: "America/Sao_Paulo" });
};

const scheduleSodre = () => {
    cron.schedule('30 10,22 * * *', async () => {
        console.log(`\n⏰ Executando: Sodré Santoro`);
        try { await executeSodre(db); } catch (e) { console.error('Erro Sodré:', e.message); }
    }, { scheduled: true, timezone: "America/Sao_Paulo" });
};

const scheduleRogerioMenezes = () => {
    cron.schedule('0 11,23 * * *', async () => {
        console.log(`\n⏰ Executando: Rogério Menezes`);
        try { await rogerioMenezes.buscarTodos(); } catch (e) { console.error('Erro Rogério Menezes:', e.message); }
    }, { scheduled: true, timezone: "America/Sao_Paulo" });
    console.log('📅 Rogério Menezes: Agendado para 11h e 23h');
};

const scheduleLeilo = () => {
    cron.schedule('30 11,23 * * *', async () => {
        console.log(`\n⏰ Executando: Leilo`);
        try { await leilo.buscarTodos(); } catch (e) { console.error('Erro Leilo:', e.message); }
    }, { scheduled: true, timezone: "America/Sao_Paulo" });
    console.log('📅 Leilo: Agendado para 11:30 e 23:30');
};

const scheduleCleanup = () => {
    // Roda todo dia à meia noite
    cron.schedule('0 0 * * *', async () => {
        console.log(`\n🧹 Executando Limpeza Diária`);
        try { await cleanExpired(); } catch (e) { console.error('Erro Limpeza:', e.message); }
    }, { scheduled: true, timezone: "America/Sao_Paulo" });
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

    console.log('\n4️⃣ Freitas Leiloeiro');
    await executeFreitas(db);

    console.log('\n5️⃣ Rogério Menezes');
    await rogerioMenezes.buscarTodos();

    console.log('\n6️⃣ Leilo');
    await leilo.buscarTodos();

    console.log('\n7️⃣ Sodré Santoro (Iniciando Turbo API)');
    await executeSodre(db);

    console.log('\n8️⃣ Copart (Paginação profunda)');
    await copart.buscarListaPrincipal();

    console.log('\n✅ Todos os crawlers executados!');
};

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
    scheduleFreitas();
    scheduleSodre();
    scheduleRogerioMenezes();
    scheduleLeilo();
    scheduleCleanup();

    console.log('\n✅ Agendador iniciado! Aguardando horários programados...');
    console.log('💡 Use Ctrl+C para parar\n');
};

start().catch(console.error);
