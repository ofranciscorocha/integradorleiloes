// Script de inicialização do MongoDB
db = db.getSiblingDB('leiloes');

// Criar coleção de veículos com índices
db.createCollection('veiculos');

// Índices para otimizar buscas
db.veiculos.createIndex({ registro: 1, site: 1 }, { unique: true });
db.veiculos.createIndex({ site: 1 });
db.veiculos.createIndex({ veiculo: 'text', descricao: 'text' });
db.veiculos.createIndex({ ano: 1 });
db.veiculos.createIndex({ criadoEm: -1 });
db.veiculos.createIndex({ 'previsao.time': 1 });

print('✅ Database leiloes initialized with indexes');
