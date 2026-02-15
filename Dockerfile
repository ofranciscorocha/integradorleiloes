# Use Node 20 (Node 18 lacks File global needed by undici/axios)
FROM node:20-slim

# Instale as dependências necessárias para o Chrome rodar no Linux (headless)
RUN apt-get update && apt-get install -y \
    ca-certificates \
    fonts-liberation \
    libasound2 \
    libatk-bridge2.0-0 \
    libatk1.0-0 \
    libc6 \
    libcairo2 \
    libcups2 \
    libdbus-1-3 \
    libexpat1 \
    libfontconfig1 \
    libgbm1 \
    libgcc1 \
    libglib2.0-0 \
    libgtk-3-0 \
    libnspr4 \
    libnss3 \
    libpango-1.0-0 \
    libpangocairo-1.0-0 \
    libstdc++6 \
    libx11-6 \
    libx11-xcb1 \
    libxcb1 \
    libxcomposite1 \
    libxcursor1 \
    libxdamage1 \
    libxext6 \
    libxfixes3 \
    libxi6 \
    libxrandr2 \
    libxrender1 \
    libxss1 \
    libxtst6 \
    lsb-release \
    wget \
    xdg-utils \
    && rm -rf /var/lib/apt/lists/*

# Crie o diretório da aplicação
WORKDIR /usr/src/app

# Copie apenas os arquivos de dependência primeiro para aproveitar o cache do Docker
COPY package*.json ./

# Instale as dependências (incluindo o puppeteer que vai baixar o chrome)
RUN npm install

# Copie o restante do código
COPY . .

# O Railway gerencia a porta automaticamente via variável de ambiente PORT.
# O app já está configurado para ouvir em process.env.PORT.

# Define o comando de inicialização
CMD ["npm", "start"]
