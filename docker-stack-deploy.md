### Máquina 1: Servidor Principal (Manager)

**1. Verificação de Rede e Recriação do Cluster**
Primeiro, confirme qual é o IP que o seu roteador atribuiu à sua máquina hoje.
`hostname -I`

*(Aviso: Se o IP estiver diferente do que você usou na última vez, saia do cluster antigo rodando `docker swarm leave --force` antes de continuar).*

Recrie o cluster apontando para o seu IP atual:
`docker swarm init --advertise-addr <ip-usuario>`
  *(Copie e guarde o comando `docker swarm join ...` que o terminal vai cuspir na tela).*

**2. Autenticação e Preparação de Volumes**
Autentique-se para garantir que o envio das imagens não será bloqueado. Em seguida, crie os volumes para o banco de dados.
`docker login`
`docker volume create postgres_primary_data`
`docker volume create postgres_replica_data`

**3. Build e Envio (Push) das Imagens**
A grande sacada de fazer o *push* é que a sua segunda máquina não precisará compilar nada. O Swarm fará com que ela baixe as imagens prontas da nuvem.
`docker build -t camargoconan/forca-backend:latest ./backend`
`docker push camargoconan/forca-backend:latest`
`docker build -t camargoconan/forca-frontend:latest ./frontend`
`docker push camargoconan/forca-frontend:latest`

**4. Subir a Aplicação (Deploy)**
`docker stack deploy -c docker-stack.yml forca-stack`

---

### Máquina 2: Servidor Secundário (Worker)

Como o push já enviou as imagens atualizadas para o Docker Hub, o trabalho na segunda máquina é apenas conectá-la à rede do cluster.

**1. Entrar no Cluster**
* Cole no terminal o comando que você copiou no início da Máquina 1 (ele terá o formato `docker swarm join --token <SEU_TOKEN> <ip-da-maquina-1>:2377`).

Assim que a segunda máquina entrar, o *Manager* (Máquina 1) vai delegar as tarefas para ela e iniciar o download das imagens automaticamente.
**2. Verificar o Status dos Serviços**
`docker service ls`
`docker service ps forca-stack_backend`
`docker service ps forca-stack_frontend`
`docker service ps forca-stack_postgres-primary`
`docker service ps forca-stack_postgres-replica`
`docker service ps forca-stack_redis`
`docker service ps forca-stack_nginx`

---

**3. Acessar a Aplicação**
* Abra o navegador e acesse `http://<ip-da-maquina-1>:80` para ver a aplicação rodando. O Swarm vai cuidar de distribuir as requisições entre as máquinas, garantindo alta disponibilidade e balanceamento de carga.    
* Se quiser acessar diretamente a máquina secundária, use `http://<ip-da-maquina-2>:80`. O Swarm vai redirecionar as requisições para os serviços que estão rodando lá.
* Lembre-se de que o Swarm é inteligente o suficiente para redirecionar as requisições para os serviços disponíveis, mesmo que um dos nós esteja inativo. Isso garante que a aplicação continue funcionando sem interrupções.
* Se quiser monitorar os logs dos serviços, use `docker service logs forca-stack_backend` ou substitua `backend` pelo nome do serviço que deseja acompanhar.
* Se precisar escalar algum serviço, como o backend, use `docker service scale forca-stack_backend=3` para aumentar o número de réplicas. O Swarm vai distribuir as réplicas entre as máquinas disponíveis automaticamente.
* Se quiser remover o stack, use `docker stack rm forca-stack` e o Swarm vai cuidar de parar e remover todos os serviços relacionados.
* Lembre-se de que o Swarm é uma solução de orquestração poderosa, mas é importante monitorar o desempenho e a saúde dos serviços para garantir que tudo esteja funcionando corretamente. Use `docker service ps` para verificar o status dos serviços e `docker node ls` para ver o status dos nós no cluster.
* Se precisar acessar o terminal de um container específico, use `docker exec -it <container_id> bash` para entrar no terminal do container e realizar as operações necessárias.

---
1. Verifique e Fixe o Contexto
   Primeiro, vamos garantir que todos os comandos vão para o mesmo lugar.

Bash
`docker context ls`
Você verá uma lista. O contexto com um asterisco * é o ativo (provavelmente será desktop-linux ou default). Vamos forçar o uso do default do Docker Desktop para garantir:

Bash
`docker context use default`
(Se você costuma usar o desktop-linux, mude para ele: docker context use desktop-linux).

2. O Combo "Apaga e Refaz"
   Como as imagens já estão salvas e em cache (e enviadas para o Docker Hub com sucesso!), recriar o Swarm é instantâneo e não vai fazer você perder nenhum progresso. Rode esta sequência de uma vez:

# Força a saída de qualquer cluster fantasma que tenha ficado preso
`docker swarm leave --force`

# Recria o cluster fixando-o no contexto atual
`docker swarm init --advertise-addr 192.168.3.21`

# Faz o deploy imediatamente
`docker stack deploy -c docker-stack.yml forca-stack`
Assim que ele aceitar o stack deploy, ele vai retornar uma lista de serviços sendo criados (Creating service forca-stack_postgres-primary, etc.).

Lembrete para o Notebook (Máquina 2):
Como você forçou a saída (leave) e recriou (init), o Token mudou. Copie o novo comando docker swarm join --token ... que a Máquina 1 gerar agora no passo 2 e cole no seu notebook para que ele entre nesse novo cluster atualizado!
---
Agora que o Manager (Desktop) está rodando e orquestrando o show, faltam apenas dois passos rápidos para fechar esse laboratório.1. Conectar o Notebook (Nó Worker)Abra o terminal do seu notebook, certifique-se de que o contexto do Docker não está bugado lá também, e simplesmente cole o comando de join que acabou de ser gerado pelo seu desktop:Bashdocker swarm join --token SWMTKN-1-28sekfkbma5xmmnn6b0j3rsadj17zdrma1gmtzt7nutnz2khzo-bq1wu0rwyoqgn1m89mcm9v4fa 192.168.3.21:2377
2. Verificar a Distribuição e a Saúde do ClusterDe volta ao seu Desktop, vamos olhar o painel de controle do Docker Swarm para ver onde ele alocou cada réplica. Rode estes dois comandos:Bash# Mostra o status geral de todos os serviços (réplicas desejadas vs. rodando)
`docker service ls`

# Mostra exatamente em qual máquina (Node) cada contêiner está rodando
`docker stack ps forca-stack`
Se tudo estiver com o status Running, o seu backend distribuído com PostgreSQL replicado e Redis Sentinel  está 100% operacional.Você já tentou acessar http://192.168.3.21:5173 no navegador do notebook ou do desktop para ver o jogo renderizando com a nova arquitetura?
---

