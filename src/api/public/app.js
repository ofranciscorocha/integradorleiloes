const API_URL = 'http://localhost:8181';

// Estado da aplicação
let currentState = {
    page: 1,
    limit: 12,
    search: '',
    site: ''
};

// Formata moeda
const formatCurrency = (value) => {
    if (!value) return 'R$ --';
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
};

// Formata data
const formatDate = (timestamp) => {
    if (!timestamp) return 'Data não inf.';
    return new Date(timestamp).toLocaleDateString('pt-BR');
};

// Carrega estatísticas iniciais
const loadStats = async () => {
    try {
        const res = await fetch(`${API_URL}/stats`);
        const data = await res.json();

        if (data.success) {
            const statsHtml = `
                <div class="col-md-3">
                    <div class="stats-box">
                        <div class="stats-number">${data.stats.total}</div>
                        <div>Veículos Totais</div>
                    </div>
                </div>
                <div class="col-md-3">
                    <div class="stats-box" style="background-color: #e67e22;">
                        <div class="stats-number">${data.stats.porSite['palaciodosleiloes.com.br'] || 0}</div>
                        <div>Palácio</div>
                    </div>
                </div>
                <div class="col-md-3">
                    <div class="stats-box" style="background-color: #8e44ad;">
                        <div class="stats-number">${data.stats.porSite['vipleiloes.com.br'] || 0}</div>
                        <div>VIP Leilões</div>
                    </div>
                </div>
                <div class="col-md-3">
                    <div class="stats-box" style="background-color: #27ae60;">
                        <div class="stats-number">${data.stats.porSite['guariglialeiloes.com.br'] || 0}</div>
                        <div>Guariglia</div>
                    </div>
                </div>
            `;
            document.getElementById('stats-container').innerHTML = statsHtml;
        }
    } catch (error) {
        console.error('Erro ao carregar stats:', error);
        document.getElementById('connection-status').className = 'badge bg-danger';
        document.getElementById('connection-status').innerHTML = '<i class="fas fa-times-circle me-1"></i>Offline';
    }
};

// Renderiza um card de veículo
const renderCard = (veiculo) => {
    const defaultImage = 'https://via.placeholder.com/400x300?text=Sem+Foto';
    const image = (veiculo.fotos && veiculo.fotos.length > 0) ? veiculo.fotos[0] : defaultImage;

    let siteClass = 'badge-secondary';
    let siteName = 'Desconhecido';

    if (veiculo.site.includes('palacio')) { siteClass = 'badge-palacio'; siteName = 'Palácio'; }
    else if (veiculo.site.includes('vip')) { siteClass = 'badge-vip'; siteName = 'VIP'; }
    else if (veiculo.site.includes('guariglia')) { siteClass = 'badge-guariglia'; siteName = 'Guariglia'; }

    // Define cor com base no tipo de sinistro
    let tipoBadge = '';
    if (veiculo.tipo) {
        let tipoClass = 'bg-secondary';
        if (veiculo.tipo === 'colisao') kindClass = 'bg-danger';
        else if (veiculo.tipo === 'pequena_monta') kindClass = 'bg-warning text-dark';
        else if (veiculo.tipo === 'roubo') kindClass = 'bg-primary';

        tipoBadge = `<span class="badge ${tipoClass} me-2">${veiculo.tipo.toUpperCase().replace('_', ' ')}</span>`;
    }

    return `
        <div class="col">
            <div class="card card-veiculo">
                <span class="badge badge-site ${siteClass}">${siteName}</span>
                <img src="${image}" class="card-img-top" alt="${veiculo.veiculo}" onerror="this.src='${defaultImage}'">
                <div class="card-body d-flex flex-column">
                    <h5 class="card-title text-truncate" title="${veiculo.veiculo}">${veiculo.veiculo || 'Veículo sem nome'}</h5>
                    <div class="mb-2">
                        ${tipoBadge}
                        <span class="badge bg-light text-dark border">${veiculo.ano || 'Ano N/A'}</span>
                    </div>
                    
                    <div class="mt-2 flex-grow-1">
                        <div class="info-row" title="Leilão">
                            <i class="fas fa-gavel"></i>
                            <span>Lote: <strong>${veiculo.registro.lote || veiculo.registro}</strong></span>
                        </div>
                        <div class="info-row" title="Local">
                            <i class="fas fa-map-marker-alt"></i>
                            <span class="text-truncate">${veiculo.localLeilao || 'Local não inf.'}</span>
                        </div>
                        <div class="info-row" title="Data/Previsão">
                            <i class="far fa-clock"></i>
                            <span>${(veiculo.previsao && veiculo.previsao.string) ? veiculo.previsao.string : 'Em breve'}</span>
                        </div>
                    </div>

                    <div class="mt-3 pt-3 border-top">
                        <div class="d-flex justify-content-between align-items-end mb-2">
                             <small class="text-muted">Lance Atual</small>
                             <div class="price-tag">${formatCurrency(veiculo.ultimoLanceValor || veiculo.valorInicial || 0)}</div>
                        </div>
                        <a href="${veiculo.link}" target="_blank" class="btn btn-primary btn-ver">
                            Ver no Site <i class="fas fa-external-link-alt ms-1"></i>
                        </a>
                    </div>
                </div>
            </div>
        </div>
    `;
};

// Busca veículos e atualiza a tela
const buscarVeiculos = async (page = 1) => {
    // Atualiza estado
    currentState.page = page;
    currentState.search = document.getElementById('search-input').value;
    currentState.site = document.getElementById('site-select').value;

    // Loading
    document.getElementById('loading').style.visibility = 'visible';

    try {
        const params = new URLSearchParams({
            page: currentState.page,
            limit: currentState.limit,
            search: currentState.search,
            site: currentState.site
        });

        const res = await fetch(`${API_URL}/veiculos?${params}`);
        const data = await res.json();

        if (data.success) {
            // Atualiza total
            document.getElementById('total-results').innerText = `Encontrados: ${data.pagination.total} veículos`;

            // Renderiza cards
            const container = document.getElementById('veiculos-container');
            if (data.items.length === 0) {
                container.innerHTML = `<div class="col-12 text-center py-5"><h4 class="text-muted">Nenhum veículo encontrado</h4></div>`;
            } else {
                container.innerHTML = data.items.map(renderCard).join('');
            }

            // Renderiza paginação
            renderPagination(data.pagination);
        }

    } catch (error) {
        console.error('Erro na busca:', error);
        alert('Erro ao buscar veículos. Verifique se a API está rodando.');
    } finally {
        document.getElementById('loading').style.visibility = 'hidden';
    }
};

// Renderiza paginação
const renderPagination = (pagination) => {
    const { page, totalPages } = pagination;
    const paginationEl = document.getElementById('pagination');
    let html = '';

    // Botão Anterior
    html += `<li class="page-item ${page === 1 ? 'disabled' : ''}">
                <button class="page-link" onclick="buscarVeiculos(${page - 1})">Anterior</button>
             </li>`;

    // Páginas (lógica simplificada para exibir algumas páginas)
    const startPage = Math.max(1, page - 2);
    const endPage = Math.min(totalPages, page + 2);

    if (startPage > 1) {
        html += `<li class="page-item"><button class="page-link" onclick="buscarVeiculos(1)">1</button></li>`;
        if (startPage > 2) html += `<li class="page-item disabled"><span class="page-link">...</span></li>`;
    }

    for (let i = startPage; i <= endPage; i++) {
        html += `<li class="page-item ${i === page ? 'active' : ''}">
                    <button class="page-link" onclick="buscarVeiculos(${i})">${i}</button>
                 </li>`;
    }

    if (endPage < totalPages) {
        if (endPage < totalPages - 1) html += `<li class="page-item disabled"><span class="page-link">...</span></li>`;
        html += `<li class="page-item"><button class="page-link" onclick="buscarVeiculos(${totalPages})">${totalPages}</button></li>`;
    }

    // Botão Próximo
    html += `<li class="page-item ${page === totalPages ? 'disabled' : ''}">
                <button class="page-link" onclick="buscarVeiculos(${page + 1})">Próximo</button>
             </li>`;

    paginationEl.innerHTML = html;
};

// Inicialização
document.addEventListener('DOMContentLoaded', () => {
    loadStats();
    buscarVeiculos();

    // Enter na busca
    document.getElementById('search-input').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') buscarVeiculos(1);
    });
});
