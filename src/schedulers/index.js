import cron from 'node-cron';
import dotenv from 'dotenv';
import connectDatabase from '../database/db.js';
import createPalacioCrawler from '../crawlers/palaciodosleiloes/index.js';
import createVipCrawler from '../crawlers/vipleiloes/index.js';
import createGuarigliaCrawler from '../crawlers/guariglialeiloes/index.js';
import createRogerioMenezesCrawler from '../crawlers/rogeriomenezes/index.js';
import createLeiloCrawler from '../crawlers/leilo/index.js';
import createMglCrawler from '../crawlers/mgl/index.js';
import createPestanaCrawler from '../crawlers/pestanaleiloes/index.js';
import { execute as executeFreitas } from '../crawlers/freitas/index.js';
import { execute as executeSodre } from '../crawlers/sodre/index.js';
import copart from '../crawlers/copart/index.js';
import cleanExpired from '../tasks/cleanExpired.js';

dotenv.config();

console.log('🚀 Iniciando agendador de crawlers...\n');

const DELAY = parseInt(process.env.CRAWLER_DELAY_MS) || 5000;

let palacio, vip, guariglia, rogerioMenezes, leilo, mgl, pestana, copart;
let db;

const init = async () => {
    db = await connectDatabase();
    palacio = createPalacioCrawler(db);
    vip = createVipCrawler(db);
    guariglia = createGuarigliaCrawler(db);
    rogerioMenezes = createRogerioMenezesCrawler(db);
    leilo = createLeiloCrawler(db);
    mgl = createMglCrawler(db);
    pestana = createPestanaCrawler(db);
    copart = createCopart(db);

    console.log('✅ Todos os crawlers inicializados!\n');
};

const schedulePestana = () => {
    cron.schedule('0 12,0 * * *', async () => {
        console.log(`\n⏰ Executando: Pestana Leilões`);
        try { await pestana.buscarTodos(); } catch (e) { console.error('Erro Pestana:', e.message); }
    }, { scheduled: true, timezone: "America/Sao_Paulo" });
    console.log('📅 Pestana Leilões: Agendado para 12h e 0h');
};

const scheduleMgl = () => {
    cron.schedule('30 12,0 * * *', async () => {
        console.log(`\n⏰ Executando: MGL Leilões`);
        try { await mgl.buscarTodos(); } catch (e) { console.error('Erro MGL:', e.message); }
    }, { scheduled: true, timezone: "America/Sao_Paulo" });
    console.log('📅 MGL Leilões: Agendado para 12:30 e 0:30');
};

const scheduleCopart = () => {
    cron.schedule('0 1,13 * * *', async () => {
        console.log(`\n⏰ Executando: Copart`);
        try { await copart.buscarTodos(); } catch (e) { console.error('Erro Copart:', e.message); }
    }, { scheduled: true, timezone: "America/Sao_Paulo" });
    console.log('📅 Copart: Agendado para 1h e 13h');
};

const scheduleFreitas = () => {
    cron.schedule('45 12,0 * * *', async () => {
        console.log(`\n⏰ Executando: Freitas Leiloeiro`);
        try { await executeFreitas(db); } catch (e) { console.error('Erro Freitas:', e.message); }
    }, { scheduled: true, timezone: "America/Sao_Paulo" });
    console.log('📅 Freitas Leiloeiro: Agendado para 12:45 e 0:45');
};

const scheduleSodre = () => {
    cron.schedule('15 11,23 * * *', async () => {
        console.log(`\n⏰ Executando: Sodré Santoro`);
        try { await executeSodre(db); } catch (e) { console.error('Erro Sodré:', e.message); }
    }, { scheduled: true, timezone: "America/Sao_Paulo" });
    console.log('📅 Sodré Santoro: Agendado para 11:15 e 23:15');
};

const scheduleVip = () => {
    cron.schedule('0 */4 * * *', async () => {
        console.log(`\n⏰ Executando: VIP Leilões`);
        try { await vip.buscarTodasPaginas(DELAY); } catch (e) { console.error('Erro VIP:', e.message); }
    }, { scheduled: true, timezone: "America/Sao_Paulo" });
    console.log('📅 VIP Leilões: Agendado a cada 4 horas');
};

const schedulePalacio = () => {
    cron.schedule('30 */4 * * *', async () => {
        console.log(`\n⏰ Executando: Palácio dos Leilões`);
        try { await palacio.buscarESalvar(); } catch (e) { console.error('Erro Palácio:', e.message); }
    }, { scheduled: true, timezone: "America/Sao_Paulo" });
    console.log('📅 Palácio dos Leilões: Agendado a cada 4 horas');
};

const scheduleGuariglia = () => {
    cron.schedule('0 2,14 * * *', async () => {
        console.log(`\n⏰ Executando: Guariglia Leilões`);
        try { await guariglia.buscarTodos(); } catch (e) { console.error('Erro Guariglia:', e.message); }
    }, { scheduled: true, timezone: "America/Sao_Paulo" });
    console.log('📅 Guariglia Leilões: Agendado para 2h e 14h');
};

const scheduleRogerioMenezes = () => {
    cron.schedule('30 2,14 * * *', async () => {
        console.log(`\n⏰ Executando: Rogério Menezes`);
        try { await rogerioMenezes.buscarTodos(); } catch (e) { console.error('Erro Rogério Menezes:', e.message); }
    }, { scheduled: true, timezone: "America/Sao_Paulo" });
    console.log('📅 Rogério Menezes: Agendado para 2:30 e 14:30');
};

const scheduleLeilo = () => {
    cron.schedule('0 3,15 * * *', async () => {
        console.log(`\n⏰ Executando: Leilo`);
        try { await leilo.buscarTodos(); } catch (e) { console.error('Erro Leilo:', e.message); }
    }, { scheduled: true, timezone: "America/Sao_Paulo" });
    console.log('📅 Leilo: Agendado para 3h e 15h');
};

const scheduleCleanup = () => {
    cron.schedule('0 4 * * *', async () => {
        console.log(`\n⏰ Executando: Limpeza de itens expirados`);
        try { await cleanExpired(db); } catch (e) { console.error('Erro Limpeza:', e.message); }
    }, { scheduled: true, timezone: "America/Sao_Paulo" });
    console.log('📅 Limpeza: Agendada para 4h');
};

const executarTodos = async () => {
    console.log('\n🔄 Executando todos os crawlers...\n');

    console.log('1️⃣ Palácio dos Leilões');
    try { await palacio.buscarESalvar(); } catch (e) { console.error('Erro Palácio:', e.message); }

    console.log('\n2️⃣ VIP Leilões');
    try { await vip.buscarTodasPaginas(DELAY); } catch (e) { console.error('Erro VIP:', e.message); }

    console.log('\n3️⃣ Guariglia Leilões');
    try { await guariglia.buscarTodos(); } catch (e) { console.error('Erro Guariglia:', e.message); }

    console.log('\n4️⃣ Freitas Leiloeiro');
    try { await executeFreitas(db); } catch (e) { console.error('Erro Freitas:', e.message); }

    console.log('\n5️⃣ Rogério Menezes');
    try { await rogerioMenezes.buscarTodos(); } catch (e) { console.error('Erro Rogério Menezes:', e.message); }

    console.log('\n6️⃣ Leilo');
    try { await leilo.buscarTodos(); } catch (e) { console.error('Erro Leilo:', e.message); }

    console.log('\n7️⃣ Sodré Santoro');
    try { await executeSodre(db); } catch (e) { console.error('Erro Sodré:', e.message); }

    console.log('\n8️⃣ MGL Leilões');
    try { await mgl.buscarTodos(); } catch (e) { console.error('Erro MGL:', e.message); }

    console.log('\n9️⃣ Pestana Leilões');
    try { await pestana.buscarTodos(); } catch (e) { console.error('Erro Pestana:', e.message); }

    console.log('\n🔟 Copart');
    try { await copart.buscarTodos(); } catch (e) { console.error('Erro Copart:', e.message); }

    console.log('\n✅ Todos os crawlers executados!');
};

const start = async () => {
    await init();

    if (process.argv.includes('--run')) {
        await executarTodos();
        console.log('Finalizado.');
        process.exit(0);
    }

    schedulePalacio();
    scheduleVip();
    scheduleGuariglia();
    scheduleFreitas();
    scheduleSodre();
    scheduleRogerioMenezes();
    scheduleLeilo();
    scheduleMgl();
    schedulePestana();
    scheduleCopart();
    scheduleCleanup();

    console.log('\n✅ Agendador iniciado! Aguardando horários programados...');
    console.log('💡 Use Ctrl+C para parar\n');
};

start().catch(console.error);
