let currentState = {
    user: null,
    totalVehicles: 0,
    currentPage: 1,
    currentTipo: '',
    filters: {
        search: '',
        site: '',
        anoMin: '',
        anoMax: '',
        uf: '',
        sort: 'recente'
    }
};

// ============ AUTH LOGIC ============

const checkAuth = () => {
    const user = JSON.parse(localStorage.getItem('car-leiloes-user'));
    if (user) {
        currentState.user = user;
        updateAuthUI();
    }
};

const updateAuthUI = () => {
    const authArea = document.getElementById('auth-area');
    const mobileAuthArea = document.getElementById('mobile-auth-area');

    if (currentState.user) {
        const userHtml = `
            <div class="user-profile" onclick="handleLogout()">
                <img src="${currentState.user.avatar || 'https://ui-avatars.com/api/?name=' + currentState.user.nome}" class="user-avatar">
                <span class="user-name">${currentState.user.nome}</span>
                <i class="fas fa-sign-out-alt" style="margin-left: 10px; color: var(--text-muted);"></i>
            </div>
        `;
        authArea.innerHTML = userHtml;
        mobileAuthArea.innerHTML = `
            <div class="user-profile" onclick="handleLogout(); toggleMobileMenu();" style="justify-content: center; padding: 1rem; background: var(--bg-body); border-radius: 8px;">
                <img src="${currentState.user.avatar || 'https://ui-avatars.com/api/?name=' + currentState.user.nome}" class="user-avatar">
                <span class="user-name" style="color: var(--text-main);">${currentState.user.nome}</span>
                <i class="fas fa-sign-out-alt" style="margin-left: 10px; color: var(--text-muted);"></i>
            </div>
            <p style="text-align: center; font-size: 0.8rem; color: var(--text-muted); margin-top: 0.5rem;">Clique para sair</p>
        `;
    } else {
        const buttonsHtml = `
            <button class="btn-header-login" onclick="openLoginModal('login')">Entrar</button>
            <button class="btn-header-signup" onclick="openLoginModal('signup')">Cadastrar</button>
        `;
        authArea.innerHTML = buttonsHtml;
        mobileAuthArea.innerHTML = `
            <button class="btn-drawer-alert" onclick="openAlertModal(); toggleMobileMenu();">
                <i class="fab fa-whatsapp"></i> Criar Alerta de Veículo
            </button>
            <div class="drawer-auth-buttons">
                <button class="btn-drawer-login" onclick="openLoginModal('login'); toggleMobileMenu();">Entrar</button>
                <button class="btn-drawer-signup" onclick="openLoginModal('signup'); toggleMobileMenu();">Cadastrar</button>
            </div>
        `;
    }
    // Update display of items
    renderVeiculos();
};

const toggleMobileMenu = () => {
    const drawer = document.getElementById('mobile-drawer');
    const overlay = document.getElementById('mobile-drawer-overlay');

    if (drawer.classList.contains('active')) {
        drawer.classList.remove('active');
        overlay.style.display = 'none';
        document.body.style.overflow = ''; // Release scroll
    } else {
        drawer.classList.add('active');
        overlay.style.display = 'block';
        document.body.style.overflow = 'hidden'; // Prevent scroll when menu is open
    }
};

const openLoginModal = (view = 'login') => {
    document.getElementById('auth-modal').style.display = 'flex';
    toggleAuthView(view);
};

const closeLoginModal = () => {
    document.getElementById('auth-modal').style.display = 'none';
};

const openAlertModal = () => {
    document.getElementById('alert-modal').style.display = 'flex';
};

const closeAlertModal = () => {
    document.getElementById('alert-modal').style.display = 'none';
};

const handleCreateAlert = async (event) => {
    event.preventDefault();
    const formData = new FormData(event.target);
    const data = Object.fromEntries(formData.entries());

    try {
        const res = await fetch('/alerts', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        const result = await res.json();
        if (result.success) {
            alert('✅ Alerta criado com sucesso! Você receberá uma mensagem quando encontrarmos seu veículo.');
            closeAlertModal();
            event.target.reset();
        } else {
            alert('Erro ao criar alerta. Tente novamente.');
        }
    } catch (e) {
        console.error('Erro:', e);
        alert('Erro de conexão. Tente novamente.');
    }
};


const toggleAuthView = (view) => {
    const loginView = document.getElementById('login-view');
    const signupView = document.getElementById('signup-view');
    if (view === 'login') {
        loginView.style.display = 'block';
        signupView.style.display = 'none';
    } else {
        loginView.style.display = 'none';
        signupView.style.display = 'block';
    }
};

const saveUser = (user) => {
    localStorage.setItem('car-leiloes-user', JSON.stringify(user));
    currentState.user = user;
    updateAuthUI();
    closeLoginModal();
    // Refresh to show unmasked data
    buscarVeiculos(1);
};

const handleLogin = async (e) => {
    e.preventDefault();
    const btn = e.target.querySelector('button');
    const originalText = btn.innerText;
    btn.innerText = 'Entrando...';
    btn.disabled = true;

    const email = e.target.email?.value || e.target.querySelector('input[type="email"]').value;
    const pass = e.target.senha?.value || e.target.querySelector('input[type="password"]').value;

    try {
        const res = await fetch('/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, senha: pass })
        });
        const data = await res.json();

        if (data.success) {
            saveUser(data.user);
        } else {
            alert('Erro: ' + data.error);
        }
    } catch (err) {
        alert('Erro de conexão ao tentar login.');
    } finally {
        btn.innerText = originalText;
        btn.disabled = false;
    }
};

const handleSignup = async (e) => {
    e.preventDefault();
    const btn = e.target.querySelector('button');
    const originalText = btn.innerText;
    btn.innerText = 'Cadastrando...';
    btn.disabled = true;

    const formData = new FormData(e.target);
    const data = Object.fromEntries(formData.entries());

    try {
        const res = await fetch('/auth/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        const result = await res.json();

        if (result.success) {
            alert('Conta criada com sucesso!');
            saveUser(result.user);
        } else {
            alert('Erro: ' + result.error);
        }
    } catch (err) {
        alert('Erro de conexão ao tentar cadastro.');
    } finally {
        btn.innerText = originalText;
        btn.disabled = false;
    }
};

const loginWithGoogle = () => {
    // Simulate Google OAuth flow
    const overlay = document.createElement('div');
    overlay.style = "position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(255,255,255,0.95);z-index:9999;display:flex;align-items:center;justify-content:center;flex-direction:column;font-family:Inter,sans-serif;";
    overlay.innerHTML = `
        <img src="https://www.gstatic.com/images/branding/googlelogo/2x/googlelogo_color_92x30dp.png" style="margin-bottom:2rem;">
        <div style="width:40px;height:40px;border:4px solid #f3f3f3;border-top:4px solid #4285F4;border-radius:50%;animation:spin 1s linear infinite;margin-bottom:1rem;"></div>
        <p style="font-weight:600; color:#444;">Autenticando com Google...</p>
        <style>@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }</style>
    `;
    document.body.appendChild(overlay);

    setTimeout(() => {
        document.body.removeChild(overlay);
        saveUser({
            nome: 'Usuário Google',
            email: 'usuario.google@gmail.com',
            avatar: 'https://lh3.googleusercontent.com/a/default-user=s96-c'
        });
        alert('Bem-vindo! Login com Google realizado com sucesso.');
    }, 1500);
};

const handleLogout = () => {
    if (confirm('Deseja sair da sua conta?')) {
        localStorage.removeItem('car-leiloes-user');
        currentState.user = null;
        updateAuthUI();
    }
};

// ============ DATA FETCHING ============

const fetchStats = async () => {
    try {
        const res = await fetch('/stats');
        const data = await res.json();
        if (data.success) {
            const val = document.getElementById('floating-count') || document.getElementById('hero-total-vehicles');
            if (val) val.textContent = data.total.toLocaleString('pt-BR').padStart(5, '0');
        }
    } catch (e) {
        console.error('Erro ao buscar stats:', e);
    }
};

const loadSites = async () => {
    try {
        const res = await fetch('/sites');
        const data = await res.json();
        if (data.success && data.sites) {
            const select = document.getElementById('site-filter');
            if (!select) return;

            // Keep the "All sites" option
            select.innerHTML = '<option value="">Todos os Sites (Integrados)</option>';

            data.sites.sort((a, b) => a.name.localeCompare(b.name)).forEach(site => {
                const opt = document.createElement('option');
                opt.value = site.id;
                opt.textContent = site.name;
                select.appendChild(opt);
            });
        }
    } catch (e) { console.error('Error loading sites list:', e); }
};

const buscarVeiculos = async (page = 1) => {
    currentState.currentPage = page;
    const loading = document.getElementById('loading');
    const container = document.getElementById('veiculos-container');

    loading.style.display = 'block';
    container.style.opacity = '0.5';

    try {
        const params = new URLSearchParams({
            page,
            limit: 24,
            search: document.getElementById('search-input').value,
            site: document.getElementById('site-filter').value,
            anoMin: document.getElementById('ano-min').value,
            anoMax: document.getElementById('ano-max').value,
            uf: document.getElementById('estado-filter').value,
            condicao: document.getElementById('condicao-filter').value,
            sort: document.getElementById('sort-order').value,
            tipo: currentState.currentTipo || ''
        });

        const res = await fetch(`/veiculos?${params}`);
        const data = await res.json();

        if (data.success) {
            currentState.veiculos = data.items;
            currentState.pagination = data.pagination;
            renderVeiculos();
            renderPagination();

            // Update all counters
            const total = data.pagination.total;
            if (document.getElementById('count-value')) document.getElementById('count-value').textContent = total;
            if (document.getElementById('total-veiculos')) document.getElementById('total-veiculos').textContent = total;

            // Optional: Update hero if we want it to reflect "available"
            if (document.getElementById('hero-total-vehicles')) {
                // Only update hero if it's 0 (initial load might fail) or always? 
                // Let's rely on fetchStats for hero, but this ensures non-zero if stats fails.
                if (document.getElementById('hero-total-vehicles').textContent === '0000') {
                    document.getElementById('hero-total-vehicles').textContent = total.toString().padStart(4, '0');
                }
            }
        }
    } catch (e) {
        console.error('Erro ao buscar veículos:', e);
    } finally {
        loading.style.display = 'none';
        container.style.opacity = '1';
    }
};

const renderVeiculos = () => {
    const container = document.getElementById('veiculos-container');
    if (!currentState.veiculos || currentState.veiculos.length === 0) {
        container.innerHTML = '<div style="grid-column: 1/-1; text-align: center; padding: 4rem;">Nenhum veículo encontrado com os filtros selecionados.</div>';
        return;
    }

    // FREEMIUM LOGIC: Limit 5 items per site for non-logged users.
    // AND lock ALL items if page > 1 (prevent bypassing limit by pagination).
    const siteCounts = {};
    const MAX_FREE_PER_SITE = 5;
    const isLogged = !!currentState.user;
    const isPageOne = currentState.currentPage === 1;

    container.innerHTML = currentState.veiculos
        .map(v => {
            if (!siteCounts[v.site]) siteCounts[v.site] = 0;
            siteCounts[v.site]++;

            let isLocked = !isLogged;
            if (isLocked) {
                // If not logged in:
                // 1. If Page > 1 -> ALWAYS LOCKED
                // 2. If Page 1 -> Lock only if count > 10
                if (!isPageOne) {
                    isLocked = true;
                } else {
                    isLocked = siteCounts[v.site] > MAX_FREE_PER_SITE;
                }
            } else {
                // Logged in -> Never locked
                isLocked = false;
            }

            return renderCard(v, isLocked);
        })
        .join('');
};

const renderCard = (veiculo, isLocked = false) => {
    const isLogged = !!currentState.user;
    const siteNameDisplay = (!isLocked) ? formatSiteName(veiculo.site) : '🔒 Nome Oculto';

    // Link Action: If locked, prompt login. If logged in/unlocked, go to link.
    const linkAction = (!isLocked)
        ? `href="${veiculo.link}" target="_blank"`
        : `href="#" onclick="event.preventDefault(); openLoginModal('signup')"`;

    const siteClass = veiculo.site.replace(/[^a-z0-9]/gi, '-').toLowerCase();
    const siteBadge = (!isLocked)
        ? `<div class="badge badge-site badge-${siteClass}">${formatSiteName(veiculo.site)}</div>`
        : `<div class="badge badge-restricted"><i class="fas fa-lock"></i></div>`;

    let valorStr = veiculo.valor ? parseFloat(veiculo.valor).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : 'Consulte';
    if (isLocked) valorStr = 'R$ *******';

    let dataLeilao = '---';
    if (veiculo.previsao && veiculo.previsao.string) {
        dataLeilao = veiculo.previsao.string;
    } else if (veiculo.dataInicio) {
        const d = new Date(veiculo.dataInicio);
        dataLeilao = d.toLocaleDateString('pt-BR') + ' ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    }

    const localizacao = veiculo.localLeilao || 'Consultar';
    const condicao = veiculo.condicao || 'Geral';
    const condicaoClass = condicao.toLowerCase().replace(/[^a-z0-9]/gi, '-');

    // Photo logic
    let photoUrl = 'https://placehold.co/400x300?text=Sem+Foto';
    if (veiculo.fotos && veiculo.fotos.length > 0) {
        const rawUrl = veiculo.fotos[0];
        if (rawUrl.startsWith('http') && !rawUrl.includes('placehold.co')) {
            photoUrl = `/proxy-img?url=${encodeURIComponent(rawUrl)}`;
        } else {
            photoUrl = rawUrl;
        }
    }

    // Locked UI Classes
    const blurClass = isLocked ? 'blurred-img' : '';
    const lockOverlay = isLocked
        ? `<div class="locked-overlay"><i class="fas fa-lock fa-3x"></i><p>Exclusivo Membros</p></div>`
        : '';

    return `
    <div class="vehicle-card ${isLocked ? 'locked-card' : ''}">
        <div class="card-image">
            <img src="${photoUrl}" class="${blurClass}" loading="lazy" onerror="this.src='https://placehold.co/400x300?text=Erro+na+Imagem'">
            ${lockOverlay}
            <div class="card-badges">
                ${siteBadge}
            </div>
        </div>
        <div class="card-content">
            <a ${linkAction} class="card-title" title="${veiculo.veiculo}">${isLocked ? 'Veículo Exclusivo (Cadastre-se)' : veiculo.veiculo}</a>
            
            <div class="card-details">
                <div class="detail-row">
                    <span class="detail-label">ANO</span>
                    <span class="detail-value">${veiculo.ano || '---'}</span>
                </div>
                <div class="detail-row">
                    <span class="detail-label">DATA</span>
                    <span class="detail-value">${dataLeilao}</span>
                </div>
                <div class="detail-row">
                    <span class="detail-label">LEILOEIRO</span>
                    <span class="detail-value" style="${!isLogged ? 'color: #9ca3af;' : ''}">${siteNameDisplay}</span>
                </div>
                <div class="detail-row">
                    <span class="detail-label">LOCAL</span>
                    <span class="detail-value">${localizacao}</span>
                </div>
                <div class="detail-row">
                    <span class="detail-label">CONDIÇÃO</span>
                    <span class="detail-value badge-condicao condicao-${condicaoClass}">${condicao}</span>
                </div>
            </div>

            <div class="card-footer">
                <div class="price-container">
                    <span class="price-label">Lance Atual</span>
                    <div class="price-tag">${valorStr}</div>
                </div>
                <a ${linkAction} class="btn-card ${(!isLocked) ? 'btn-success' : ''}">
                    ${(!isLocked) ? 'VER LOTE' : 'DESBLOQUEAR'}
                </a>
            </div>
        </div>
    </div>
    `;
};

const renderPagination = () => {
    const pag = currentState.pagination;
    const container = document.getElementById('pagination');
    if (!pag || pag.totalPages <= 1) {
        container.innerHTML = '';
        return;
    }

    let html = '';
    // Previous
    if (pag.page > 1) {
        html += `<button class="page-btn" onclick="buscarVeiculos(${pag.page - 1})"><i class="fas fa-chevron-left"></i></button>`;
    }

    // Pages (simple)
    for (let i = 1; i <= Math.min(pag.totalPages, 5); i++) {
        html += `<button class="page-btn ${i === pag.page ? 'active' : ''}" onclick="buscarVeiculos(${i})">${i}</button>`;
    }

    // Next
    if (pag.page < pag.totalPages) {
        html += `<button class="page-btn" onclick="buscarVeiculos(${pag.page + 1})"><i class="fas fa-chevron-right"></i></button>`;
    }

    container.innerHTML = html;
};

const formatSiteName = (site) => {
    const sites = {
        'palaciodosleiloes.com.br': 'Palácio dos Leilões',
        'vipleiloes.com.br': 'VIP Leilões',
        'guariglialeiloes.com.br': 'Guariglia Leilões',
        'freitasleiloeiro.com.br': 'Freitas Leiloeiro',
        'sodresantoro.com.br': 'Sodré Santoro',
        'copart.com.br': 'Copart',
        'rogeriomenezes.com.br': 'Rogério Menezes',
        'leilo.com.br': 'Leilo.com.br',
        'milanleiloes.com.br': 'Milan Leilões',
        'sumareleiloes.com.br': 'Sumaré Leilões',
        'satoleiloes.com.br': 'Sato Leilões',
        'danielgarcialeiloes.com.br': 'Daniel Garcia Leilões',
        'joaoemilio.com.br': 'João Emílio',
        'mgl.com.br': 'MGL Leilões',
        'claudiokussleiloes.com.br': 'Claudio Kuss Leilões',
        'pestanaleiloes.com.br': 'Pestana Leilões',
        'parquedosleiloes.com.br': 'Parque dos Leilões',
        'leiloesfreire.com.br': 'Leilões Freire',
        'montenegroleiloes.com.br': 'Montenegro Leilões',
        'lancecertoleiloes.com.br': 'Lance Certo Leilões',
        'leiloespb.com.br': 'Leilões PB',
        'superbid.net': 'Superbid'
    };
    return sites[site] || site;
};

// ============ TABS (TIPO) ============

const setTipoTab = (el) => {
    // Update visual state
    document.querySelectorAll('.search-tab').forEach(tab => tab.classList.remove('active'));
    el.classList.add('active');

    // Set the tipo filter
    currentState.currentTipo = el.dataset.tipo || '';

    // Trigger search
    buscarVeiculos(1);
};

// ============ VIEW MODE & RELOAD SIMULATION ============

const setViewMode = (mode) => {
    const container = document.getElementById('veiculos-container');
    const btnGrid = document.getElementById('btn-grid');
    const btnList = document.getElementById('btn-list');

    if (mode === 'list') {
        container.classList.add('list-view');
        btnList.classList.add('active');
        btnGrid.classList.remove('active');
    } else {
        container.classList.remove('list-view');
        btnGrid.classList.add('active');
        btnList.classList.remove('active');
    }
    localStorage.setItem('car-leiloes-view-mode', mode);
};

const simularRecarregamento = async () => {
    const icon = document.getElementById('reload-icon');
    // Updated selector to match new class
    const btn = document.querySelector('.btn-pulse-trigger');

    if (btn && btn.disabled) return;

    // 1. Inicia animação
    if (btn) {
        btn.disabled = true;
        const originalText = btn.querySelector('span').innerText;
        btn.querySelector('span').innerText = 'BUSCANDO...';
    }

    // Robot spin animation
    if (icon) {
        icon.classList.remove('fa-robot');
        icon.classList.add('fa-sync', 'fa-spin');
    }

    // 2. Cria e mostra o Toast
    let toast = document.querySelector('.reload-toast');
    if (!toast) {
        toast = document.createElement('div');
        toast.className = 'reload-toast';
        document.body.appendChild(toast);
    }
    toast.innerHTML = `<i class="fas fa-robot"></i> <span>Robô buscando novas ofertas...</span>`;
    setTimeout(() => toast.classList.add('show'), 100);

    // 3. Simula tempo de processamento do "robô" (1.5s)
    await new Promise(r => setTimeout(r, 1500));

    // 4. Executa a busca real para atualizar os dados
    await buscarVeiculos(1);
    await fetchStats();

    // 5. Finaliza
    toast.innerHTML = `<i class="fas fa-check-circle" style="color: #25d366;"></i> <span>Novos veículos encontrados!</span>`;

    // Restore icon and text
    if (icon) {
        icon.classList.remove('fa-sync', 'fa-spin');
        icon.classList.add('fa-robot');
    }
    if (btn) {
        btn.querySelector('span').innerText = 'BUSCAR NOVOS VEÍCULOS';
    }

    setTimeout(() => {
        toast.classList.remove('show');
        if (btn) btn.disabled = false;
    }, 3000);
};

// ============ INIT ============

document.addEventListener('DOMContentLoaded', () => {
    checkAuth();
    loadSites();

    // Resume view mode preference
    const savedMode = localStorage.getItem('car-leiloes-view-mode') || 'grid';
    setViewMode(savedMode);

    buscarVeiculos(1);
    fetchStats();

    // Close modal on overlay click
    document.getElementById('auth-modal').addEventListener('click', (e) => {
        if (e.target.id === 'auth-modal') closeLoginModal();
    });

    // Enter key on search input triggers search
    document.getElementById('search-input').addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            buscarVeiculos(1);
        }
    });

    // Year filters: trigger search on change/blur
    document.getElementById('ano-min').addEventListener('change', () => buscarVeiculos(1));
    document.getElementById('ano-max').addEventListener('change', () => buscarVeiculos(1));
});
