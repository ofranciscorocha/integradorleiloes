const API_URL = 'http://localhost:8181';

let currentState = {
    page: 1,
    limit: 12,
    search: '',
    site: '',
    anoMin: '',
    anoMax: '',
    kmMax: '',
    tipo: '',
    estado: ''
};

// Utils
const formatCurrency = (value) => {
    if (!value) return 'R$ --';
    try {
        return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 0 }).format(value);
    } catch { return 'R$ ' + value; }
};

const formatSiteName = (domain) => {
    if (!domain) return 'Leilão';
    if (domain.includes('palacio')) return 'Palácio';
    if (domain.includes('vip')) return 'VIP Leilões';
    if (domain.includes('guariglia')) return 'Guariglia';
    if (domain.includes('freitas')) return 'Freitas';
    if (domain.includes('sodre')) return 'Sodré';
    if (domain.includes('copart')) return 'Copart';
    return 'Leilão';
};

// Render Card (Bid.Cars Style - Direct Child of Grid)
const renderCard = (veiculo) => {
    const defaultImage = 'https://via.placeholder.com/400x300/e5e7eb/9ca3af?text=Sem+Foto';
    const image = (veiculo.fotos && veiculo.fotos.length > 0) ? veiculo.fotos[0] : defaultImage;
    const siteName = formatSiteName(veiculo.site);

    // Badges Condition
    const isColisao = veiculo.tipo === 'colisao';
    const conditionText = isColisao ? 'Colisão' : 'Conservado';
    const conditionStyle = isColisao ? 'color: #ef4444; background: #fee2e2;' : 'color: #10b981; background: #d1fae5;';

    const ano = veiculo.ano || '----';
    const lote = (veiculo.registro && veiculo.registro.lote) ? veiculo.registro.lote : (veiculo.registro || 'N/D');
    const local = veiculo.localLeilao ? veiculo.localLeilao.split('-')[0].trim() : 'Brasil';
    const dataLeilao = (veiculo.previsao && veiculo.previsao.string) ? veiculo.previsao.string : 'Em breve';

    return `
    <div class="vehicle-card">
        <div class="card-img-wrapper">
            <img src="${image}" class="card-img-top" alt="Veículo" onerror="this.src='${defaultImage}'">
            <div class="card-badges">
                <span class="badge-site">${siteName}</span>
                <span class="badge-condition" style="${conditionStyle}">${conditionText}</span>
            </div>
        </div>
        
        <div class="card-body">
            <a href="${veiculo.link}" target="_blank" class="vehicle-title" title="${veiculo.veiculo}">
                ${veiculo.veiculo || 'Veículo sem Nome'}
            </a>
            
            <div class="vehicle-details">
                <div class="detail-item"><strong>Lote:</strong> ${lote}</div>
                <div class="detail-item"><strong>Ano:</strong> ${ano}</div>
                <div class="detail-item"><strong>Combustível:</strong> ${veiculo.combustivel || 'Flex'}</div>
                <div class="detail-item"><strong>KM:</strong> ${veiculo.km ? veiculo.km.toLocaleString() : '---'}</div>
            </div>

            <div class="price-box">
                <div>
                    <div class="price-label">Lance Atual</div>
                    <div class="price-value">${formatCurrency(veiculo.ultimoLanceValor || veiculo.valorInicial)}</div>
                </div>
            </div>
        </div>
        
        <div class="card-footer-meta">
            <span><i class="fas fa-map-marker-alt"></i> ${local}</span>
            <span><i class="far fa-clock"></i> ${dataLeilao}</span>
        </div>
    </div>
    `;
};

// Fetch Data
const buscarVeiculos = async (page = 1) => {
    currentState.page = page;

    const searchInput = document.getElementById('search-input');
    const siteFilter = document.getElementById('site-filter');
    const anoMinInput = document.getElementById('ano-min');
    const anoMaxInput = document.getElementById('ano-max');
    const kmMaxInput = document.getElementById('km-max');
    const tipoFilter = document.getElementById('tipo-filter');
    const estadoFilter = document.getElementById('estado-filter');

    if (searchInput) currentState.search = searchInput.value;
    if (siteFilter) currentState.site = siteFilter.value;
    if (anoMinInput) currentState.anoMin = anoMinInput.value;
    if (anoMaxInput) currentState.anoMax = anoMaxInput.value;
    if (kmMaxInput) currentState.kmMax = kmMaxInput.value;
    if (tipoFilter) currentState.tipo = tipoFilter.value;
    if (estadoFilter) currentState.estado = estadoFilter.value;

    const loading = document.getElementById('loading');
    const container = document.getElementById('veiculos-container');
    const totalEl = document.getElementById('total-veiculos');
    const paginationEl = document.getElementById('pagination');

    if (loading) loading.style.display = 'block';
    if (container) container.innerHTML = '';
    if (paginationEl) paginationEl.innerHTML = '';

    try {
        const params = new URLSearchParams({
            page: currentState.page,
            limit: currentState.limit,
            search: currentState.search,
            site: currentState.site,
            anoMin: currentState.anoMin,
            anoMax: currentState.anoMax,
            kmMax: currentState.kmMax,
            tipo: currentState.tipo,
            estado: currentState.estado
        });

        const res = await fetch(`${API_URL}/veiculos?${params}`);
        const data = await res.json();

        if (data.success) {
            if (totalEl) totalEl.innerText = data.pagination.total.toLocaleString();

            if (data.items.length === 0) {
                container.innerHTML = `<div style="grid-column: 1/-1; text-align: center; padding: 4rem; color: #6b7280;">
                    <h3>Nenhum veículo encontrado</h3>
                    <p>Tente ajustar seus filtros na lateral.</p>
                </div>`;
            } else {
                container.innerHTML = data.items.map(renderCard).join('');
            }

            renderPagination(data.pagination);
        }
    } catch (error) {
        console.error(error);
        if (container) container.innerHTML = '<p style="color:red; text-align:center;">Erro ao carregar dados. Verifique API.</p>';
    } finally {
        if (loading) loading.style.display = 'none';
    }
};

// Pagination
const renderPagination = (pagination) => {
    const { page, totalPages } = pagination;
    const paginationEl = document.getElementById('pagination');
    if (!paginationEl) return;

    let html = '';

    const btn = (p, text, active = false) => `<button class="page-btn ${active ? 'active' : ''}" onclick="buscarVeiculos(${p})">${text}</button>`;

    if (page > 1) html += btn(page - 1, '<');

    let start = Math.max(1, page - 2);
    let end = Math.min(totalPages, page + 2);

    if (start > 1) {
        html += btn(1, '1');
        if (start > 2) html += '<span style="padding:0.5rem">...</span>';
    }

    for (let i = start; i <= end; i++) {
        html += btn(i, i, i === page);
    } // Loop corrigido

    if (end < totalPages) {
        if (end < totalPages - 1) html += '<span style="padding:0.5rem">...</span>';
        html += btn(totalPages, totalPages);
    }

    if (page < totalPages) html += btn(page + 1, '>');

    paginationEl.innerHTML = html;
};

// Global Filter
window.filtrarSite = (site) => {
    currentState.site = site;
    buscarVeiculos(1);
};

window.buscarVeiculos = buscarVeiculos; // Expose globally

document.addEventListener('DOMContentLoaded', () => {
    buscarVeiculos();

    const searchInput = document.getElementById('search-input');
    if (searchInput) {
        searchInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') buscarVeiculos(1);
        });
    }
});
