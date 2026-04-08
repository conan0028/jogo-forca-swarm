FROM node:22-bookworm

WORKDIR /app

# Copia dependências primeiro (otimização de cache do Docker)
COPY package*.json ./
RUN npm install

# Copia o resto do código
COPY . .

# Expõe a porta 3001
EXPOSE 3001

# O comando para rodar o backend
CMD ["node", "server.js"]
