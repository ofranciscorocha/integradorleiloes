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
};

const handleLogout = () => {
    if (confirm('Deseja sair da sua conta?')) {
        localStorage.removeItem('car-leiloes-user');
        currentState.user = null;
        updateAuthUI();
    }
};

const loginWithGoogle = () => {
    const user = {
        nome: 'Usuário Google',
        email: 'user@google.com',
        avatar: 'https://lh3.googleusercontent.com/a/ACg8ocL8jXjA=s96-c'
    };
    saveUser(user);
};

const loginMock = () => {
    const email = document.querySelector('#login-view input[type="email"]').value;
    const pass = document.querySelector('#login-view input[type="password"]').value;

    if (email === 'admin' && pass === 'Rf159357$') {
        window.location.href = '/admin.html';
        return;
    }

    if (email && pass) {
        saveUser({
            nome: email.split('@')[0],
            email: email
        });
    } else {
        alert('E-mail e senha são obrigatórios.');
    }
};

const handleSignup = (event) => {
    event.preventDefault();
    const formData = new FormData(event.target);
    const data = Object.fromEntries(formData.entries());

    // Simulate signup success
    saveUser({
        nome: data.nome,
        email: data.email,
        details: data
    });
    alert('Cadastro realizado com sucesso! Bem-vindo ao CARS LEILÕES.');
};

// ============ DATA FETCHING ============

const fetchStats = async () => {
    try {
        const res = await fetch('/stats');
        const data = await res.json();
        if (data.success) {
            document.getElementById('hero-total-vehicles').textContent = data.total.toString().padStart(4, '0');
        }
    } catch (e) {
        console.error('Erro ao buscar stats:', e);
        // Fallback: try to get from pagination if stats fails
        const countValue = document.getElementById('count-value');
        if (countValue && countValue.textContent !== '...') {
            document.getElementById('hero-total-vehicles').textContent = countValue.textContent.padStart(4, '0');
        }
    }
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
    container.innerHTML = currentState.veiculos
        .filter(v => v.fotos && v.fotos.length > 0)
        .map(v => renderCard(v))
        .join('');
};

const renderCard = (veiculo) => {
    const isLogged = !!currentState.user;
    const siteNameDisplay = isLogged ? formatSiteName(veiculo.site) : '🔒 Nome Oculto';
    const linkAction = isLogged ? `href="${veiculo.link}" target="_blank"` : `href="#" onclick="event.preventDefault(); openLoginModal('signup')"`;

    // Only show badge if logged in or obscure it slightly? 
    // User asked for "nome do leiloeiro que precisa cadastro", so we hide/protect it.
    const siteClass = veiculo.site.replace(/[^a-z0-9]/gi, '-').toLowerCase();
    const siteBadge = isLogged
        ? `<div class="badge badge-site badge-${siteClass}">${formatSiteName(veiculo.site)}</div>`
        : `<div class="badge badge-restricted"><i class="fas fa-lock"></i></div>`;

    const valorStr = veiculo.valor ? parseFloat(veiculo.valor).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : 'Consulte';

    // Date Logic
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

    return `
    <div class="vehicle-card">
        <div class="card-image">
            <img src="${veiculo.fotos?.[0] || 'https://placehold.co/400x300?text=Sem+Foto'}" loading="lazy">
            <div class="card-badges">
                ${siteBadge}
            </div>
        </div>
        <div class="card-content">
            <a ${linkAction} class="card-title" title="${veiculo.veiculo}">${veiculo.veiculo}</a>
            
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
                <a ${linkAction} class="btn-card">
                    ${isLogged ? 'VER LOTE' : 'CADASTRE-SE'}
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

// ============ INIT ============

document.addEventListener('DOMContentLoaded', () => {
    checkAuth();
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
