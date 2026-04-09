# Docker Swarm & Chaos Engineering - Cheat Sheet

Este documento contém os comandos essenciais para gerenciar, debugar e simular falhas no cluster distribuído da Forca.

## 1. Deploy e Atualização (O Fluxo de Trabalho)

Sempre que o código for alterado, siga este fluxo para garantir que o Swarm pegue a versão mais recente sem usar cache antigo:

```bash
# 1. Recriar as imagens locais sem cache (Rodar em todas as máquinas)
docker compose build --no-cache

# 2. Fazer o deploy forçando o Swarm a ler as novas imagens (Rodar apenas no Manager)
docker stack deploy -c docker-compose.yml forca_cluster --resolve-image always
```

## 2. Gerenciamento de Serviços e Balanceamento

Comandos para ver o que está rodando e forçar redistribuição de carga.

```bash
# Listar todos os serviços ativos e quantas réplicas estão de pé
docker service ls

# Ver em quais nós (máquinas) as réplicas de um serviço específico estão rodando
docker service ps forca_cluster_backend

# Forçar o Swarm a redistribuir os contêineres de um serviço (Útil se todos caírem no mesmo nó)
docker service update --force forca_cluster_backend

# Ver os logs de um serviço em tempo real
docker service logs -f forca_cluster_backend
```

## 3. Chaos Engineering (Simulação de Falhas)

Comandos para a apresentação: simulando quedas de servidores e contêineres para testar a resiliência (State Hydration).

**A. Derrubar uma MÁQUINA inteira (Nó):**

```bash
# Ver o nome dos nós do cluster
docker node ls

# Simular a "queima" de um servidor (expulsa todos os contêineres dele)
docker node update --availability drain ubuntu-srv1

# Trazer o servidor de volta à vida
docker node update --availability active ubuntu-srv1
```

**B. Derrubar um CONTÊINER específico (Cirúrgico):**
*Nota: O Swarm perceberá a morte e criará um substituto automaticamente em segundos.*

```bash
# 1. Descubra o ID do contêiner rodando na máquina atual
docker ps

# 2. Force o assassinato do contêiner (Substitua pelo ID real)
docker rm -f <CONTAINER_ID>
```

## 4. Limpeza e "Reset" (Tratamento de Fantasmas)

Quando a rede travar, os IPs mudarem ou o banco de dados ficar sujo.

**A. O Reset Nuclear do Docker (Limpa imagens paradas, redes presas e cache):**

```bash
docker system prune -f

# Reset ainda mais agressivo (apaga volumes de banco de dados não usados)
docker system prune -a --volumes
```

**B. Limpar a Memória do Redis (Remover usuários fantasmas):**

```bash
# Encontre o ID do Redis com `docker ps`, depois execute:
docker exec -it <REDIS_CONTAINER_ID> redis-cli FLUSHALL
```

**C. Refazer o Swarm (Quando você muda de rede Wi-Fi/IP):**

```bash
# 1. Destruir o cluster atual (Rodar em TODAS as máquinas)
docker swarm leave --force

# 2. Criar um novo cluster com o IP novo (Rodar no Manager/Fedora)
docker swarm init --advertise-addr <NOVO_IP_DO_FEDORA>

# 3. Ver o token para adicionar as outras máquinas novamente
docker swarm join-token worker
```

---
