# Forca Distribuída - Backend

Este repositório contém o código do servidor (backend) para o **Jogo da Forca Multiplayer Distribuído**. A arquitetura foi desenhada com foco em resiliência e escalabilidade, permitindo que múltiplas instâncias deste servidor Node.js operem em conjunto como um autêntico sistema distribuído.

## 🛠 Tecnologias e Arquitetura

A aplicação backend foi construída integrando as seguintes tecnologias:

### 1. Node.js e Socket.io (WebSocket)
- **Node.js:** Ambiente de execução base e gerenciador dos ciclos e *timers* das partidas (processamento de turnos a cada 30 segundos).
- **Socket.io:** Responsável por toda a comunicação em tempo real bi-direcional. Através de eventos assíncronos (como `join_queue`, `play_letter`, `game_state`), o servidor comunica ao cliente atualizações na tela instantaneamente sem `polling` HTTP. Ele emite até mesmoticks do *timer* para manter ambos os jogadores sincronizados.

### 2. Redis (Armazenamento de Estado & Fila Distribuída)
O coração da arquitetura distribuída. Todo o estado efêmero e transitório é mantido na memória ultrarrápida do Redis, nunca na memória RAM local de uma instância Node.js específica.
- **Gerenciamento de Fila:** Jogadores buscando por oponentes são enfileirados em uma lista (`RPUSH`). A cada 2 jogadores na fila (`LLEN`), ocorre o *matchmaking* e criação da sala.
- **Estado do Jogo:** A palavra oculta, quantidade de erros, estado das letras mascaradas e o turno atual ficam mapeados num registro tipo *Hash* no Redis. Caso um servidor Node.js reinicie, a partida ainda existe no Redis.
- **@socket.io/redis-adapter:** Sincroniza os pacotes e eventos Socket.io entre várias instâncias Node.js. Isso significa que o 'Jogador 1' pode estar conectado no Servidor A e o 'Jogador 2' conectado no Servidor B, e ainda assim eles se enviarão letras e receberão atualizações instantaneamente e de forma transparente.

### 3. SQLite (Banco de Dados Relacional Persistente)
Banco de dados leve para salvar os os dados que não podem "sumir", diferentemente de uma partida em andamento.
- **Mapeamento de Usuário e Score:** Mantém registros simples dos `usernames` e do total de pontos adquiridos através de vitórias, W.O., e acertos nas partidas.
- **Sistema de Ranking:** Expõe os dados da tabela em resposta HTTP padrão para que a interface de *Lobby* no React preencha os 'Troféus da Morte (Rank)'. Facilmente migraria para PostgreSQL por utilizar SQL relacional padrão.

## 🕹 Lógica de Jogo Implementada (`gameLogic.js`)
A lógica hospedada no Node.js é extremamente defensiva (autoritativa):
1. **Pontuação e Morte Súbita:** Toda a validação se a letra está correta (+10 pontos), se a palavra foi completamente chutada (+100 pontos) ou se o jogador aplicou o bônus de *Morte Súbita* é checada no servidor para evitar trapaças vindas do Frontend.
2. **Sistema de Resiliência/Desconexões:** Se cair o WebSocket de um jogador, inicia-se um `timeout` de 30 segundos usando os *Timers* do Node.js. Se o jogador não enviar um evento `reconnect_attempt` nesse tempo, ocorre o W.O. e a partida é finalizada e os pontos salvos.
3. **Gerenciamento de Abandono:** Interfere diretamente na manipulação dos pontos; abandonar força vitória integral unicamente ao jogador restante, desprezando pontos da rodada.

---

Para iniciar o servidor:
```bash
npm install
npm start
```
