# 🚗 Integrador de Leilões

Sistema agregador de veículos de múltiplos sites de leilão brasileiro. Facilita a vida do arrematante ao reunir veículos de diversos leilões em um só lugar.

## ✨ Funcionalidades

- **3 sites integrados**: Palácio dos Leilões, VIP Leilões, Guariglia Leilões
- **API REST**: Busca com filtros, paginação e estatísticas
- **Atualização automática**: Agendamento com node-cron
- **MongoDB**: Persistência de dados com índices otimizados

## 🚀 Quick Start

### 1. Instalar dependências

```bash
npm install
```

### 2. Iniciar MongoDB

```bash
npm run db:up
```

### 3. Testar crawlers

```bash
npm test
```

### 4. Executar crawlers manualmente

```bash
# Todos os crawlers
npm run crawler:all -- --run

# Individualmente
npm run crawler:palacio
npm run crawler:vip
npm run crawler:guariglia
```

### 5. Iniciar API

```bash
npm run dev
```

A API estará disponível em `http://localhost:8181`

## 📋 API Endpoints

| Método | Endpoint | Descrição |
|--------|----------|-----------|
| GET | `/health` | Status da API |
| GET | `/stats` | Estatísticas gerais |
| GET | `/sites` | Sites integrados |
| GET | `/veiculos` | Listar veículos (paginado) |
| GET | `/veiculos/:id` | Buscar veículo por ID |
| POST | `/list` | Buscar com filtros |

### Exemplos de uso

```bash
# Listar veículos com paginação
curl "http://localhost:8181/veiculos?page=1&limit=10"

# Buscar por texto
curl "http://localhost:8181/veiculos?search=honda"

# Filtrar por site
curl "http://localhost:8181/veiculos?site=vipleiloes.com.br"

# Estatísticas
curl "http://localhost:8181/stats"
```

## 🗂️ Estrutura do Projeto

```
integradorleiloes/
├── src/
│   ├── api/              # API Express
│   ├── crawlers/         # Crawlers por site
│   │   ├── palaciodosleiloes/
│   │   ├── vipleiloes/
│   │   └── guariglialeiloes/
│   ├── database/         # Conexão MongoDB
│   └── schedulers/       # Agendamento
├── scripts/              # Scripts auxiliares
├── docker-compose.yml    # MongoDB
└── package.json
```

## ⚙️ Configuração

Variáveis de ambiente (`.env`):

```env
MONGODB_URI=mongodb://admin:admin123@localhost:27017/leiloes?authSource=admin
MONGODB_DB=leiloes
API_PORT=8181
CRAWLER_DELAY_MS=5000
CRAWLER_TIMEOUT_MS=15000
```

## 📅 Agendamento

Os crawlers executam automaticamente:

| Site | Horários |
|------|----------|
| Palácio dos Leilões | 7h e 19h |
| VIP Leilões | 8h e 20h |
| Guariglia Leilões | 9h e 21h |

Para manter o agendador rodando:

```bash
npm run crawler:all
```

## 🛠️ Scripts Disponíveis

| Script | Descrição |
|--------|-----------|
| `npm run dev` | Inicia API em modo desenvolvimento |
| `npm start` | Inicia API em produção |
| `npm test` | Testa conectividade dos crawlers |
| `npm run db:up` | Inicia MongoDB via Docker |
| `npm run db:down` | Para MongoDB |
| `npm run db:reset` | Reseta banco de dados |
| `npm run crawler:all` | Inicia agendador |
| `npm run crawler:all -- --run` | Executa todos uma vez |

## 📄 Licença

MIT