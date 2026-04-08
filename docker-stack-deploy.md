# 🚀 Guia de Deploy no Docker Swarm (Forca SD)

Este documento descreve os passos necessários para implantar o sistema jogo-forca-sd em um ambiente distribuído com alta disponibilidade usando Docker Swarm.

## 1. Inicializar o Swarm
Se você ainda não inicializou o Docker Swarm no seu nó de gerenciamento (Manager Node), execute o comando abaixo para ativar o swarm:

```bash
docker swarm init
```

## 2. Criar Volumes Persistentes Externos
Criamos os volumes no host para que os serviços primário e réplica do PostgreSQL persistam seus dados de forma confiável. No nó ou nós designados para o banco de dados principal e réplica, execute:

```bash
docker volume create postgres_primary_data
docker volume create postgres_replica_data
```

## 3. Construir e Publicar as Imagens
No Docker Swarm, as imagens locais do `docker-compose build` não são espalhadas automaticamente. As imagens precisam estar acessíveis para todos os nós (por exemplo, no Docker Hub ou GitHub Container Registry).

**Backend:**
```bash
docker build -t seu_registry/forca-backend:latest ./backend
docker push seu_registry/forca-backend:latest
```

**Frontend:**
```bash
docker build -t seu_registry/forca-frontend:latest ./frontend
docker push seu_registry/forca-frontend:latest
```

*(Lembre-se de substituir `seu_registry` pelo seu username do Docker Hub ou IP do repositório e atualizar isso dentro do seu arquivo `docker-stack.yml`)*

## 4. Realizar o Deploy da Stack
Para iniciar os serviços definidos e aplicar as regras de distribuição e deploy, conectando o PostgreSQL Cluster e o Redis HA (Sentinel):

```bash
docker stack deploy -c docker-stack.yml forca-stack
```

## 5. Gerenciar e Monitorar
Acompanhe os serviços distribuídos subindo e verifique sua integridade pelo cluster:

```bash
# Lista todos os serviços agrupados que compõe o forca-stack
docker service ls

# Mostra o status de cada instância em cada nó da infraestrutura
docker stack ps forca-stack
```