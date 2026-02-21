/* FILE_START */
let currentState = {
    user: null,
    totalVehicles: 0,
    currentPage: 1,
    currentTipo: 'carro',
    currentMode: 'documentavel', // 'documentavel' or 'sucata'
    filters: {
        search: '',
        site: '',
        anoMin: '',
        anoMax: '',
        uf: '',
        sort: 'recente'
    },
    favoritos: new Set(),
    showFavoritesOnly: false,
    map: null,
    mapMarkers: []
};

const UF_COORDINATES = {
    'AC': [-9.02, -70.81], 'AL': [-9.57, -36.78], 'AP': [0.90, -52.00], 'AM': [-3.41, -64.44],
    'BA': [-12.97, -38.50], 'CE': [-3.71, -38.54], 'DF': [-15.78, -47.93], 'ES': [-19.19, -40.34],
    'GO': [-16.67, -49.25], 'MA': [-2.53, -44.30], 'MT': [-12.64, -55.42], 'MS': [-20.44, -54.64],
    'MG': [-18.10, -44.00], 'PA': [-1.45, -48.50], 'PB': [-7.11, -34.86], 'PR': [-25.42, -49.27],
    'PE': [-8.05, -34.88], 'PI': [-5.09, -42.80], 'RJ': [-22.90, -43.17], 'RN': [-5.79, -35.20],
    'RS': [-30.03, -51.23], 'RO': [-8.76, -63.90], 'RR': [1.82, -61.30], 'SC': [-27.59, -48.54],
    'SP': [-23.55, -46.63], 'SE': [-10.91, -37.07], 'TO': [-10.16, -48.33]
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
            <div class="user-controls">
                <button class="btn-profile-header" onclick="openProfileModal()">
                    <i class="fas fa-user-circle"></i> Meu Perfil
                </button>
                <div class="user-profile" onclick="handleLogout()">
                    <img src="${currentState.user.avatar || 'https://ui-avatars.com/api/?name=' + currentState.user.nome}" class="user-avatar">
                    <span class="user-name">${currentState.user.nome}</span>
                    <i class="fas fa-sign-out-alt" style="margin-left: 10px; color: var(--text-muted);"></i>
                </div>
            </div>
        `;
        authArea.innerHTML = userHtml;
        mobileAuthArea.innerHTML = `
            <button class="btn-drawer-alert" onclick="openProfileModal(); toggleMobileMenu();" style="background: var(--primary-blue); margin-bottom: 0.5rem;">
                <i class="fas fa-user-circle"></i> Meu Perfil / Favoritos
            </button>
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

const loginMock = async () => {
    const modal = document.getElementById('login-view');
    const emailInput = modal.querySelector('input[type="email"]');
    const passInput = modal.querySelector('input[type="password"]');
    const email = emailInput?.value;
    const pass = passInput?.value;

    if (!email || !pass) {
        alert('Preencha e-mail e senha.');
        return;
    }

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
    }
};

const handleLogout = () => {
    if (confirm('Deseja sair da sua conta?')) {
        localStorage.removeItem('car-leiloes-user');
        currentState.user = null;
        updateAuthUI();
    }
};

// ============ DATA FETCHING ============

// Global helper for vehicle key (used in renderVeiculos, renderCard, favorites)
const getVehicleKey = (v) => {
    if (!v) return 'null';
    let regStr = v.registro && typeof v.registro === 'object'
        ? `${v.registro.leilao || ''}_${v.registro.lote || ''}`
        : String(v.registro || '');
    return `${v.site}_${regStr}`;
};

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
            search: document.getElementById('search-input')?.value || '',
            site: document.getElementById('site-filter')?.value || '',
            anoMin: document.getElementById('ano-min')?.value || '',
            anoMax: document.getElementById('ano-max')?.value || '',
            uf: document.getElementById('estado-filter')?.value || '',
            condicao: document.getElementById('condicao-filter')?.value || '',
            sort: document.getElementById('sort-order')?.value || 'recente',
            tipo: currentState.currentTipo || '',
            mode: currentState.currentMode || 'leilao'
        });

        if (currentState.currentMode === 'sucata') {
            params.append('condicao', 'Sucata');
        } else {
            params.append('condicao_not', 'Sucata');
        }

        // SPECIAL CASE: FAVORITES ONLY
        if (currentState.showFavoritesOnly) {
            params.append('favorites_only', 'true');
            params.append('user_email', currentState.user?.email || '');
        }

        const endpoint = '/veiculos';
        const res = await fetch(`${endpoint}?${params}`);
        const data = await res.json();

        if (data.success) {
            currentState.veiculos = data.items;
            currentState.pagination = data.pagination;
            renderVeiculos();
            renderPagination();
            updateMapMarkers(); // Dynamic Map Update

            // Update all counters
            const total = data.pagination.total;
            if (document.getElementById('count-value')) document.getElementById('count-value').textContent = total;
            if (document.getElementById('total-itens')) document.getElementById('total-itens').textContent = total;

            // Update Dynamic Summary
            const summaryEl = document.getElementById('results-summary');
            if (summaryEl) {
                let text = `Mostrando ${currentState.currentTipo || 'veículos'}`;
                if (currentState.currentMode === 'sucata') text += ' (SUCATAS)';

                const siteVal = document.getElementById('site-filter')?.value;
                if (siteVal) text += ` em ${formatSiteName(siteVal + '.com.br')}`;

                const ufVal = document.getElementById('estado-filter')?.value;
                if (ufVal) text += ` - ${ufVal}`;

                summaryEl.textContent = text;
            }

            if (total === 0) {
                container.innerHTML = `
                    <div style="grid-column: 1/-1; text-align: center; padding: 5rem 2rem; background: #f8fafc; border-radius: 20px; border: 2px dashed #e2e8f0; margin: 2rem 0;">
                        <i class="fas fa-search" style="font-size: 3rem; color: #cbd5e1; margin-bottom: 1rem;"></i>
                        <h3 style="color: var(--primary-dark); margin-bottom: 0.5rem;">Nenhum veículo encontrado</h3>
                        <p style="color: var(--text-muted);">Tente ajustar seus filtros ou clique em "VER TODOS OS VEÍCULOS" para resetar.</p>
                    </div>`;
            }

            // Optional: Update hero if we want it to reflect "available"
            if (document.getElementById('hero-total-vehicles')) {
                if (document.getElementById('hero-total-vehicles').textContent === '0000') {
                    document.getElementById('hero-total-vehicles').textContent = total.toString().padStart(4, '0');
                }
            }

            // Update Map
            updateMapMarkers();
        }
    } catch (e) {
        console.error('Erro ao buscar veículos:', e);
    } finally {
        loading.style.display = 'none';
        container.style.opacity = '1';
    }
};

const limparFiltrosEBuscar = () => {
    console.log('🧹 Limpando filtros - Mostrando TODOS os veículos...');
    // Reset inputs
    const ids = ['search-input', 'site-filter', 'ano-min', 'ano-max', 'estado-filter', 'condicao-filter'];
    ids.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = '';
    });

    // Reset Tabs UI highlight - remove active from all
    document.querySelectorAll('.search-tab').forEach(tab => {
        tab.classList.remove('active');
    });

    // VER TODOS = sem filtro de tipo, mostra TUDO
    currentState.currentTipo = '';
    buscarVeiculos(1);

    // Smooth scroll to top of list
    const container = document.getElementById('veiculos-container');
    if (container) container.scrollIntoView({ behavior: 'smooth', block: 'start' });
};

const renderVeiculos = () => {
    const container = document.getElementById('veiculos-container');
    if (!currentState.veiculos || currentState.veiculos.length === 0) {
        container.innerHTML = '<div style="grid-column: 1/-1; text-align: center; padding: 4rem;">Nenhum veículo encontrado com os filtros selecionados.</div>';
        return;
    }

    // FREEMIUM LOGIC: Lock system for non-registered users
    const MAX_FREE_PER_SITE = 5;
    const isLogged = !!currentState.user;

    // Page 1 check
    const currentPageNum = Number(currentState.currentPage || 1);
    const paginationPageNum = currentState.pagination ? Number(currentState.pagination.page) : 1;
    const isPageOne = currentPageNum === 1 || paginationPageNum === 1;

    // Is there an active search or filter?
    const hasSearch = !!document.getElementById('search-input')?.value.trim();
    const hasSiteFilter = !!document.getElementById('site-filter')?.value;
    const hasAnoMin = !!document.getElementById('ano-min')?.value;
    const hasAnoMax = !!document.getElementById('ano-max')?.value;
    const hasUf = !!document.getElementById('estado-filter')?.value;
    const hasCond = !!document.getElementById('condicao-filter')?.value;

    // Any filter active = search, site, ano, uf, condition (tipo tabs don't count as "filter")
    const hasAnyFilter = hasSearch || hasSiteFilter || hasAnoMin || hasAnoMax || hasUf || hasCond;

    // PRE-CALCULATE UNLOCKS
    const unlockedIds = new Set();
    if (!isLogged) {
        if (hasAnyFilter) {
            // REGRA: Qualquer filtro ativo = TUDO BLOQUEADO para não cadastrados
            // unlockedIds permanece vazio = tudo locked
        } else if (isPageOne) {
            // Home Page / VER TODOS (sem filtros): Unlock 5 por site como "teaser"
            const sites = [...new Set(currentState.veiculos.map(v => v.site))];
            sites.forEach(siteId => {
                const siteItems = currentState.veiculos.filter(v => v.site === siteId);
                const sortedItems = [...siteItems].sort((a, b) => new Date(b.criadoEm) - new Date(a.criadoEm));
                sortedItems.slice(0, MAX_FREE_PER_SITE).forEach(item => unlockedIds.add(getVehicleKey(item)));
            });
            // Safety: always unlock first 5 on home
            currentState.veiculos.slice(0, 5).forEach(v => unlockedIds.add(getVehicleKey(v)));
        }
        // Pages > 1 without filters: everything locked
    }

    container.innerHTML = currentState.veiculos
        .map(v => {
            let isLocked = false;
            if (!isLogged) {
                // If on Home Page (no filters), unlock the most recent ones
                if (isPageOne && !hasAnyFilter) {
                    isLocked = !unlockedIds.has(getVehicleKey(v));
                } else {
                    // Locked for guests when searching or on other pages
                    // But let's allow seeing SOME even then to not feel "empty"
                    isLocked = !unlockedIds.has(getVehicleKey(v));
                }
            }
            return renderCard(v, isLocked);
        })
        .join('');
};

const renderCard = (veiculo, isLocked = false) => {
    const isLogged = !!currentState.user;
    const isMarketplace = veiculo.site === 'marketplace' || currentState.currentMode === 'marketplace';

    const siteNameDisplay = (!isLocked)
        ? (isMarketplace ? 'Vendedor Particular' : formatSiteName(veiculo.site))
        : '🔒 Nome Oculto';

    const vehicleKey = getVehicleKey(veiculo);
    const isFavorited = currentState.favoritos && currentState.favoritos.has(vehicleKey);

    const detailLink = `/lote.html?id=${encodeURIComponent(veiculo.registro)}&site=${encodeURIComponent(veiculo.site)}`;
    const linkAction = (!isLocked)
        ? `href="${detailLink}" target="_blank"`
        : `href="#" onclick="event.preventDefault(); openLoginModal('signup')"`;

    const siteClass = veiculo.site.replace(/[^a-z0-9]/gi, '-').toLowerCase();
    const siteBadge = (!isLocked)
        ? `<div class="badge badge-site ${isMarketplace ? 'badge-marketplace' : 'badge-' + siteClass}">${isMarketplace ? 'MARKETPLACE' : formatSiteName(veiculo.site)}</div>`
        : `<div class="badge badge-restricted"><i class="fas fa-lock"></i></div>`;

    const sellerBadge = (isMarketplace && !isLocked) ? `<div class="badge-seller"><i class="fas fa-user-check"></i> PARTICULAR</div>` : '';

    let valorStr = veiculo.valor ? parseFloat(veiculo.valor).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : 'Consulte';
    if (isLocked) valorStr = 'R$ *******';

    const localizacaoRaw = veiculo.localLeilao || 'Consultar';
    let estado = 'BR';
    const estadoMatch = localizacaoRaw.match(/\s([A-Z]{2})$/) || localizacaoRaw.match(/^([A-Z]{2})\s/) || localizacaoRaw.match(/\b([A-Z]{2})\b/);
    if (estadoMatch) estado = estadoMatch[1];

    const condicao = veiculo.condicao || 'Geral';
    const condicaoClass = condicao.toLowerCase().replace(/[^a-z0-9]/gi, '-');

    // NEW: UF Badge
    const ufBadge = `<div class="badge-uf">${estado}</div>`;

    // NEW: Sucata Badge
    const sucataBadge = (condicao === 'Sucata' || currentState.currentMode === 'sucata')
        ? `<div class="badge-sucata"><i class="fas fa-recycle"></i> SUCATA</div>`
        : '';

    const blindadoBadge = veiculo.blindado ? `<div class="badge-blindado"><i class="fas fa-shield-alt"></i> BLINDADO</div>` : '';

    const status = veiculo.situacao || 'Disponível';
    const statusClass = status.toLowerCase().replace(/[^a-z0-9]/gi, '-');
    const statusBadge = (status !== 'Disponível')
        ? `<div class="badge-status status-${statusClass}">${status.toUpperCase()}</div>`
        : '';

    // NEW: Countdown Timer
    let countdownHtml = '';
    if (veiculo.previsao && veiculo.previsao.time) {
        countdownHtml = `<div class="countdown-timer" data-end-time="${veiculo.previsao.time}">
            <i class="fas fa-spinner fa-spin"></i> Calculando...
        </div>`;
    }

    let photoUrl = 'https://placehold.co/400x300?text=Sem+Foto';
    if (veiculo.fotos && veiculo.fotos.length > 0) {
        const rawUrl = veiculo.fotos[0];
        if (rawUrl.startsWith('http') && !rawUrl.includes('placehold.co')) {
            photoUrl = `/proxy-img?url=${encodeURIComponent(rawUrl)}`;
        } else {
            photoUrl = rawUrl;
        }
    }

    const starBtn = (isLogged && !isLocked)
        ? `<button class="star-btn ${isFavorited ? 'active' : ''}" onclick="event.preventDefault(); toggleFavorite('${veiculo.registro}', '${veiculo.site}', this)" title="Favoritar">
            <i class="${isFavorited ? 'fas' : 'far'} fa-star"></i>
           </button>`
        : '';

    const blurClass = isLocked ? 'blurred-img' : '';
    const lockOverlay = isLocked
        ? `<div class="locked-overlay"><i class="fas fa-lock fa-3x"></i><p>Exclusivo Membros</p></div>`
        : '';

    // ROBO INTELLIGENCE ELEMENTS
    const fipeHtml = veiculo.valorFipe
        ? `<div class="intel-row"><span class="intel-label">FIPE</span><span class="intel-val">R$ ${veiculo.valorFipe.toLocaleString('pt-BR')}</span></div>`
        : '';
    const marketHtml = veiculo.valorMercado
        ? `<div class="intel-row"><span class="intel-label">MERCADO</span><span class="intel-val">R$ ${veiculo.valorMercado.toLocaleString('pt-BR')}</span></div>`
        : '';

    let roiBadge = '';
    if (veiculo.lucroEstimado && veiculo.lucroEstimado > 0) {
        const roiColor = veiculo.roiPorcentagem > 25 ? '#ef4444' : '#10b981';
        roiBadge = `
            <div class="badge-roi" style="background: ${roiColor}">
                <i class="fas fa-chart-line"></i> LUCRO: R$ ${veiculo.lucroEstimado.toLocaleString('pt-BR')}
            </div>
        `;
    }

    const intelSection = (fipeHtml || marketHtml)
        ? `<div class="card-intel-section">${fipeHtml}${marketHtml}</div>`
        : '';

    const riskBadges = (veiculo.tagsRisco || []).map(tag => `
        <div class="badge-risk"><i class="fas fa-exclamation-triangle"></i> ${tag}</div>
    `).join('');

    return `
    <div class="vehicle-card ${isLocked ? 'locked-card' : ''} ${isMarketplace ? 'marketplace-card' : ''}" data-key="${vehicleKey}">
        <div class="card-image">
            <img src="${photoUrl}" class="${blurClass}" loading="lazy" onerror="this.src='https://placehold.co/400x300?text=Erro+na+Imagem'">
            ${lockOverlay}
            ${starBtn}
            <div class="card-badges">
                ${siteBadge}
                ${ufBadge}
                ${roiBadge}
                ${riskBadges}
                ${sucataBadge}
                ${sellerBadge}
                ${statusBadge}
                ${blindadoBadge}
            </div>
        </div>
        <div class="card-content">
            <a ${linkAction} class="card-title" title="${veiculo.veiculo}">${veiculo.veiculo}</a>
            
            ${countdownHtml}
            ${intelSection}

            <div class="card-details">
                <div class="detail-row">
                    <span class="detail-label">ANO</span>
                    <span class="detail-value">${veiculo.ano || '---'}</span>
                </div>
                <div class="detail-row">
                    <span class="detail-label">LEILOEIRO</span>
                    <span class="detail-value" style="${!isLogged ? 'color: #9ca3af;' : ''}">${siteNameDisplay}</span>
                </div>
                <div class="detail-row">
                    <span class="detail-label">CONDIÇÃO</span>
                    <span class="detail-value badge-condicao condicao-${condicaoClass}">${condicao}</span>
                </div>
                <div class="detail-row">
                    <span class="detail-label"><i class="fas fa-gas-pump"></i> COMBUSTÍVEL</span>
                    <span class="detail-value">${veiculo.combustivel || '---'}</span>
                </div>
                <div class="detail-row">
                    <span class="detail-label"><i class="fas fa-palette"></i> COR</span>
                    <span class="detail-value">${veiculo.cor || '---'}</span>
                </div>
                <div class="detail-row">
                    <span class="detail-label">LOCAL</span>
                    <span class="detail-value">${localizacaoRaw}</span>
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

const flyToVehicle = (uf) => {
    const coords = UF_COORDINATES[uf];
    if (!coords || !currentState.map) return;

    // Scroll to map
    const mapEl = document.getElementById('vehicle-map');
    if (mapEl) {
        mapEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }

    // Fly to
    setTimeout(() => {
        currentState.map.flyTo(coords, 8, {
            duration: 1.5,
            easeLinearity: 0.25
        });

        // Try to find and open the popup for this UF
        // Since we cluster by UF, we can find the marker in currentState.mapMarkers
        // Note: in a more advanced version, we'd find the exact vehicle marker
    }, 500);
};

const toggleFavorite = async (registro, site, btn) => {
    if (!currentState.user) {
        openLoginModal('login');
        return;
    }

    const key = `${site}_${registro} `;
    const isAdding = !btn.classList.contains('active');

    try {
        const res = await fetch('/favoritos', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                email: currentState.user.email,
                registro,
                site,
                action: isAdding ? 'add' : 'remove'
            })
        });

        const data = await res.json();
        if (data.success) {
            if (isAdding) {
                btn.classList.add('active');
                btn.querySelector('i').className = 'fas fa-star';
                if (!currentState.favoritos) currentState.favoritos = new Set();
                currentState.favoritos.add(key);
            } else {
                btn.classList.remove('active');
                btn.querySelector('i').className = 'far fa-star';
                if (currentState.favoritos) currentState.favoritos.delete(key);
            }
        }
    } catch (e) {
        console.error('Erro ao favoritar:', e);
    }
};

const openProfileModal = async () => {
    if (!currentState.user) {
        openLoginModal('login');
        return;
    }

    document.getElementById('profile-modal').style.display = 'flex';
    document.getElementById('profile-name').textContent = currentState.user.nome;
    document.getElementById('profile-email').textContent = currentState.user.email;
    document.getElementById('profile-avatar').src = currentState.user.avatar || `https://ui-avatars.com/api/?name=${currentState.user.nome}`;

    await loadProfileData();
};

const closeProfileModal = () => {
    document.getElementById('profile-modal').style.display = 'none';
};

const toggleProfileTab = (tab) => {
    document.querySelectorAll('.profile-tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.profile-tab-content').forEach(c => c.classList.remove('active'));

    const activeTab = document.querySelector(`.profile-tab[data-tab="${tab}"]`);
    if (activeTab) activeTab.classList.add('active');

    const activeContent = document.getElementById(`tab-${tab}`);
    if (activeContent) activeContent.classList.add('active');
};

const loadProfileData = async () => {
    try {
        const res = await fetch(`/perfil?email=${currentState.user.email}`);
        const data = await res.json();

        if (data.success) {
            document.getElementById('fav-count').textContent = data.stats.favoritos;
            document.getElementById('alert-count-profile').textContent = data.stats.alertas;

            // Load Favorites List
            const favRes = await fetch(`/favoritos?email=${currentState.user.email}`);
            const favData = await favRes.json();
            const favContainer = document.getElementById('favorites-container');

            if (favData.success && favData.items.length > 0) {
                // Update local Set for stars consistency
                currentState.favoritos = new Set(favData.items.map(v => getVehicleKey(v)));

                favContainer.innerHTML = favData.items
                    .map(v => renderCard(v, false))
                    .join('');
            } else {
                favContainer.innerHTML = '<div class="empty-state">Você ainda não favoritou nenhum veículo.</div>';
            }

            // Load Alerts List
            const alertsContainer = document.getElementById('profile-alerts-container');
            if (data.alerts && data.alerts.length > 0) {
                alertsContainer.innerHTML = data.alerts.map(alert => `
                    <div class="alert-item">
                        <div class="alert-title">${alert.veiculo}</div>
                        <div class="alert-meta">
                            <i class="fab fa-whatsapp"></i> ${alert.whatsapp}<br>
                            <i class="far fa-clock"></i> ${new Date(alert.createdAt).toLocaleDateString('pt-BR')}
                        </div>
                    </div>
                `).join('');
            } else {
                alertsContainer.innerHTML = '<div class="empty-state">Você ainda não configurou nenhum alerta.</div>';
            }

            // Load Announcements
            const announceContainer = document.getElementById('my-announcements-container');
            if (data.announcements && data.announcements.length > 0) {
                document.getElementById('announcement-count').textContent = data.announcements.length;
                announceContainer.innerHTML = data.announcements.map(v => renderCard(v, false)).join('');
            } else {
                document.getElementById('announcement-count').textContent = '0';
                announceContainer.innerHTML = '<div class="empty-state">Você ainda não anunciou nenhum veículo no Marketplace.</div>';
            }
        }
    } catch (e) {
        console.error('Erro ao carregar perfil:', e);
    }
};

const loadUserFavorites = async () => {
    if (!currentState.user) return;
    try {
        const res = await fetch(`/favoritos?email=${currentState.user.email}`);
        const data = await res.json();
        if (data.success) {
            currentState.favoritos = new Set(data.items.map(v => getVehicleKey(v)));
        }
    } catch (e) {
        console.error('Erro ao buscar favoritos:', e);
    }
};

// ============ UI & NAVIGATION CONTROLS ============

const toggleFavoritesView = (e) => {
    if (e) e.preventDefault();

    if (!currentState.user) {
        openLoginModal('login');
        return;
    }

    currentState.showFavoritesOnly = !currentState.showFavoritesOnly;

    // Update Menu highlight
    const favLink = document.getElementById('nav-favorites');
    if (favLink) {
        if (currentState.showFavoritesOnly) favLink.classList.add('active');
        else favLink.classList.remove('active');
    }

    // Reset page and fetch
    buscarVeiculos(1);

    // If active, maybe close mobile menu
    const drawer = document.getElementById('mobile-drawer');
    if (drawer && drawer.classList.contains('active')) toggleMobileMenu();
};

const handleScroll = () => {
    const stickyBar = document.getElementById('sticky-filter-bar');
    if (!stickyBar) return;

    const offset = 300; // Point where it becomes sticky
    if (window.scrollY > offset) {
        stickyBar.classList.add('sticky');

        // Dynamic Sticky Logo adjustment if configured
        const customStickyLogo = localStorage.getItem('sticky_logo_url');
        if (customStickyLogo) {
            const stickyImg = stickyBar.querySelector('.logo-sticky img');
            if (stickyImg && (!stickyImg.src || !stickyImg.src.includes(customStickyLogo))) {
                stickyImg.src = customStickyLogo;
            }
        }
    } else {
        stickyBar.classList.remove('sticky');
    }
};

window.addEventListener('scroll', handleScroll);

const renderPagination = () => {
    const pag = currentState.pagination;
    const containers = [
        document.getElementById('pagination'),
        document.getElementById('pagination-bottom')
    ];

    if (!pag || pag.totalPages <= 1) {
        containers.forEach(c => { if (c) c.innerHTML = ''; });
        return;
    }

    let html = '';
    // Previous
    if (pag.page > 1) {
        html += `<button class="page-btn" onclick="buscarVeiculos(${pag.page - 1}); window.scrollTo({top: 0, behavior: 'smooth'});"><i class="fas fa-chevron-left"></i></button>`;
    }

    // Pages (simple)
    for (let i = 1; i <= Math.min(pag.totalPages, 5); i++) {
        html += `<button class="page-btn ${i === pag.page ? 'active' : ''}" onclick="buscarVeiculos(${i}); window.scrollTo({top: 0, behavior: 'smooth'});">${i}</button>`;
    }

    // Next
    if (pag.page < pag.totalPages) {
        html += `<button class="page-btn" onclick="buscarVeiculos(${pag.page + 1}); window.scrollTo({top: 0, behavior: 'smooth'});"><i class="fas fa-chevron-right"></i></button>`;
    }

    containers.forEach(c => {
        if (c) c.innerHTML = html;
    });
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

// ============ MARKETPLACE LOGIC ============

// setSearchMode logic was moved to the bottom of the file for multi-instance synchronization

async function updateHeaderStats() {
    try {
        const res = await fetch('/api/stats-summary');
        const data = await res.json();
        if (data.success) {
            const lEl = document.getElementById('count-leiloeiros');
            const aEl = document.getElementById('count-disponiveis');
            const eEl = document.getElementById('count-encerrando');

            if (lEl) lEl.textContent = data.stats.totalLeiloeiros;
            if (aEl) aEl.textContent = data.stats.totalDisponiveis.toLocaleString();
            if (eEl) eEl.textContent = data.stats.encerrandoHoje;

        }
    } catch (e) {
        console.error('Error fetching stats:', e);
    }
}

function startGlobalTimer() {
    setInterval(() => {
        document.querySelectorAll('.countdown-timer').forEach(el => {
            const endTime = parseInt(el.dataset.endTime);
            if (!endTime) return;

            const now = Date.now();
            const diff = endTime - now;

            if (diff <= 0) {
                el.innerHTML = '<i class="fas fa-clock"></i> ENCERRADO';
                el.classList.add('urgent');
                return;
            }

            const days = Math.floor(diff / (1000 * 60 * 60 * 24));
            const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
            const mins = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
            const secs = Math.floor((diff % (1000 * 60)) / 1000);

            let timeStr = '';
            if (days > 0) timeStr += `${days}d `;
            timeStr += `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;

            el.innerHTML = `<i class="fas fa-clock"></i> ${timeStr}`;

            if (diff < 3600000) {
                el.classList.add('urgent');
            }
        });
    }, 1000);
}

// Marketplace logic (Announce/Upload) removed by user request.

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
    const btn = document.querySelector('.btn-pulse-trigger');

    if (btn && btn.disabled) return;

    if (btn) {
        btn.disabled = true;
        const originalText = btn.querySelector('span').innerText;
        btn.querySelector('span').innerText = 'BUSCANDO...';
    }

    if (icon) {
        icon.classList.remove('fa-robot');
        icon.classList.add('fa-sync', 'fa-spin');
    }

    let toast = document.querySelector('.reload-toast');
    if (!toast) {
        toast = document.createElement('div');
        toast.className = 'reload-toast';
        document.body.appendChild(toast);
    }
    toast.innerHTML = `<i class="fas fa-robot"></i> <span>Robô buscando novas ofertas...</span>`;
    setTimeout(() => toast.classList.add('show'), 100);

    await new Promise(r => setTimeout(r, 1500));

    await buscarVeiculos(1);
    await updateHeaderStats();

    toast.innerHTML = `<i class="fas fa-check-circle" style="color: #25d366;"></i> <span>Novos veículos encontrados!</span>`;

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

// ============ INTERACTIVE MAP LOGIC ============
const initMap = () => {
    const mapElement = document.getElementById('vehicle-map');
    if (!mapElement) return;

    // Brasil Center Coordinates
    const brasilCenter = [-14.235, -51.925];

    currentState.map = L.map('vehicle-map', {
        zoomControl: true,
        scrollWheelZoom: false
    }).setView(brasilCenter, 4);

    // Premium Dark Mode Tiles
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
        subdomains: 'abcd',
        maxZoom: 20
    }).addTo(currentState.map);

    // Initialize Marker Cluster Group
    currentState.markerClusterGroup = L.markerClusterGroup({
        showCoverageOnHover: false,
        spiderfyOnMaxZoom: true,
        zoomToBoundsOnClick: true,
        maxClusterRadius: 50
    });
    currentState.map.addLayer(currentState.markerClusterGroup);
};

const updateMapMarkers = () => {
    if (!currentState.map || !currentState.veiculos) return;

    // Clear existing markers
    currentState.markerClusterGroup.clearLayers();
    currentState.mapMarkers = [];

    const heatMap = {}; // Deduplicate by UF for better visualization if many lots in same state

    currentState.veiculos.forEach(v => {
        const local = v.localLeilao || '';
        const estadoMatch = local.match(/\s([A-Z]{2})$/) || local.match(/^([A-Z]{2})\s/) || local.match(/\b([A-Z]{2})\b/);
        const uf = estadoMatch ? estadoMatch[1] : null;

        if (uf && UF_COORDINATES[uf]) {
            if (!heatMap[uf]) heatMap[uf] = { count: 0, items: [] };
            heatMap[uf].count++;
            heatMap[uf].items.push(v);
        }
    });

    Object.entries(heatMap).forEach(([uf, data]) => {
        const coords = UF_COORDINATES[uf];
        const finalCoords = [coords[0], coords[1]];

        // Create a custom DivIcon with pulsing effect and FA icon
        // We pick the most common type in this group
        const firstType = data.items[0]?.tipo || 'carro';
        let iconClass = 'fa-car';
        if (firstType === 'moto') iconClass = 'fa-motorcycle';
        if (firstType === 'pesado') iconClass = 'fa-truck';
        if (data.items.some(i => i.condicao === 'Sucata')) iconClass = 'fa-recycle';

        const customIcon = L.divIcon({
            html: `
                <div class="custom-map-marker">
                    <div class="marker-pulse"></div>
                    <div class="marker-icon"><i class="fas ${iconClass}"></i></div>
                    <div class="marker-label">${data.count}</div>
                </div>
            `,
            className: 'custom-div-icon',
            iconSize: [40, 40],
            iconAnchor: [20, 40],
            popupAnchor: [0, -35]
        });

        const marker = L.marker(finalCoords, { icon: customIcon });

        // Add to cluster group
        currentState.markerClusterGroup.addLayer(marker);

        const popupContent = `
            <div class="map-popup-premium">
                <div class="popup-uf-badge">${uf}</div>
                <div class="popup-title">${data.count} Veículos</div>
                <div class="popup-subtitle">Nesta região</div>
                <div class="popup-list">
                    ${data.items.slice(0, 3).map(i => `
                        <div class="popup-item">
                            <span class="dot"></span>
                            <span class="text">${i.veiculo.substring(0, 30)}</span>
                        </div>
                    `).join('')}
                    ${data.count > 3 ? `<div class="popup-more">+ ${data.count - 3} outros</div>` : ''}
                </div>
                <button class="btn-popup-view" onclick="setFilterUF('${uf}')">Ver Todos na Região</button>
            </div>
        `;

        marker.bindPopup(popupContent);
        currentState.mapMarkers.push(marker);
    });

    // If only one UF is filtered, zoom into it
    const filterUf = document.getElementById('estado-filter')?.value;
    if (filterUf && UF_COORDINATES[filterUf]) {
        currentState.map.setView(UF_COORDINATES[filterUf], 6);
    } else if (currentState.mapMarkers.length > 0) {
        // Auto fit bounds if markers exist
        const group = new L.featureGroup(currentState.mapMarkers);
        currentState.map.fitBounds(group.getBounds().pad(0.1));
    }
};

const setFilterUF = (uf) => {
    const select = document.getElementById('estado-filter');
    if (select) {
        select.value = uf;
        buscarVeiculos(1);
        // Scroll to results
        const container = document.getElementById('veiculos-container');
        if (container) container.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
};

const setSearchMode = (mode) => {
    currentState.currentMode = mode;

    // Update all toggle instances (Hero and Sticky)
    document.querySelectorAll('.mode-toggle-container').forEach(container => {
        container.querySelectorAll('.mode-toggle').forEach(btn => {
            const btnMode = btn.getAttribute('data-mode');
            if (btnMode === mode) {
                btn.classList.add('active');
            } else {
                btn.classList.remove('active');
            }
        });
    });

    // Update Search Button Text across all instances
    document.querySelectorAll('.btn-search').forEach(btn => {
        // Only target buttons that look like search buttons (avoid changing Login/Signup/Announce)
        if (btn.innerText.includes('BUSCAR') || btn.innerHTML.includes('fa-search') || btn.innerHTML.includes('fa-recycle')) {
            if (mode === 'sucata') {
                btn.innerHTML = '<i class="fas fa-recycle"></i> BUSCAR SUCATAS';
            } else {
                btn.innerHTML = '<i class="fas fa-search"></i> BUSCAR';
            }
        }
    });

    buscarVeiculos(1);

    // Persist choice
    localStorage.setItem('car-leiloes-mode-pref', mode);
};

// Initialize mode from storage or default
const initSearchMode = () => {
    const saved = localStorage.getItem('car-leiloes-mode-pref');
    if (saved) {
        setSearchMode(saved);
    }
};

document.addEventListener('DOMContentLoaded', () => {
    checkAuth();
    if (currentState.user) loadUserFavorites();
    loadSites();
    initMap();
    initSearchMode();

    const savedMode = localStorage.getItem('car-leiloes-view-mode') || 'grid';
    setViewMode(savedMode);

    buscarVeiculos(1);
    updateHeaderStats();
    startGlobalTimer();

    document.getElementById('auth-modal').addEventListener('click', (e) => {
        if (e.target.id === 'auth-modal') closeLoginModal();
    });

    const profileModal = document.getElementById('profile-modal');
    if (profileModal) {
        profileModal.addEventListener('click', (e) => {
            if (e.target.id === 'profile-modal') closeProfileModal();
        });
    }

    document.getElementById('search-input').addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            buscarVeiculos(1);
        }
    });

    ['ano-min', 'ano-max'].forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            el.addEventListener('change', () => buscarVeiculos(1));
            el.addEventListener('keydown', (e) => { if (e.key === 'Enter') buscarVeiculos(1); });
        }
    });
});
