FROM node:20-alpine

WORKDIR /app

# Copia dependências
COPY package*.json ./
RUN npm install

# Copia o resto do código
COPY . .

# Expõe a porta que o Vite utiliza por padrão
EXPOSE 5173

# Roda o servidor de desenvolvimento expondo a rede do container
CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0"]
