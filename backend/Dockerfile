FROM node:22-bookworm

WORKDIR /app

# Instala ferramentas de construção para o sqlite3
RUN apt-get update && apt-get install -y python3 make g++ && rm -rf /var/lib/apt/lists/*

# Copia dependências primeiro (otimização de cache do Docker)
COPY package*.json ./
RUN npm install --build-from-source=sqlite3

# Copia o resto do código
COPY . .

# Expõe a porta 3001
EXPOSE 3001

# O comando para rodar o backend
CMD ["node", "server.js"]
