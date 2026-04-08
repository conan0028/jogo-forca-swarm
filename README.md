# Jogo da Forca: Multiplayer Distribuído

![Status](https://img.shields.io/badge/Status-Finalizado-brightgreen)
![Docker](https://img.shields.io/badge/Docker-Suportado-blue)

Esse é um repositório criado para a disciplina **CMP1896 - Sistemas Distribuídos na N1**. Ele consiste em uma recriação completa do clássico Jogo da Forca, construída do zero com arquitetura distribuída e suporte a multi-jogadores simultâneos conectados em tempo real.

## Principais Funcionalidades

- **Matchmaking e Fila:** Os jogadores entram num Lobby virtual até que o sistema (via pareamento dinâmico e rápido por Redis) encontre um oponente.
- **Jogo Baseado em Turnos de 30s:** Cada turno é processado de forma completamente defensiva ("server-authoritative") no servidor para impedir trapaças, rodando um cronômetro na interface nativa do Phaser Canvas.
- **Tensão Visual Atmosférica:** A Forca não é de "brincadeira". Nuvens rodam com velocidades orgânicas infinitas enquanto um céu simula pânico: o fundo passa do azul natural para amarelo de atenção, finalizando em vermelho-crimson quando os erros batem o limite.
- **Resiliência de Rede:** Se a sua aba piscar e a internet cair, nada de W.O imediato. O servidor estipula um *timeout* indulgente de 30 segundos, congelando as telas. Retorne antes de zerar ou perca por W.O!
- **Morte Súbita (Bônus):** Pode tentar chutar toda a palavra, ganhando +30 pontos adiantados, sob uma pena: se errar 1 letra sequer durante esse modo, a forca termina em execução na hora.

## Stack de Tecnologias

- **Frontend:** React (JSX + Glassmorphism UI), Phaser 3 (Engine gráfica do cenário) e Vite.
- **Backend:** Node.js (Servidor), Express, Socket.io (WebSocket em Tempo Real).
- **Sistemas Distribuídos & Persistência:** Redis (Fila, Sessões Efêmeras em Memória RAM), e SQLite (Banco Relacional que armazena Usuários e Ranking das partidas anteriores).
- **Infraestrutura:** Docker e Docker Compose nativos.

---

## Como Rodar este Projeto (Docker)

A maneira mais fácil e segura de executar o projeto sem poluir sua máquina com dependências de versão é utilizando o Docker Compose, que constrói os servidores de Jogo, o banco de dados e a Interface tudo com 1 único comando.

### Pré-Requisitos

- **Git** instalado para clonar o repositório.
- **Docker** e **Docker Compose** instalados (O uso do modo Desktop é o mais prático para Windows ou macOS).

### Passo a Passo

1. **Faça o clone do repositório no seu PC/Notebook:**

   ```bash
   git clone https://github-faculdade:conan0028/hangman-game-1896.git
   cd SD_jogo-forca
   ```

2. **Inicie os servidores empacotados pelo arquivo `.yml`:**
   Diga ao seu terminal para subir a orquestração inteira usando o arquivo que já vive na raiz do projeto:

   ```bash
   docker compose up --build
   ```

3. **Pronto! Acesse o Jogo:**
   Quando todos os conteineres baixarem a rede, instâncias do Redis e do Node.js, ele abrirá portas automáticas de Rede. Simplesmente vá no seu navegador preferido e abra a interface:

   -> [http://localhost:5173](http://localhost:5173) (Para jogar no mesmo computador)

   **Como Jogar com Outros Computadores (Cabo/WiFi):**
   Para outros computadores na mesma rede acessarem o seu jogo, eles devem usar o seu endereço IP local seguido da porta **5173**.

   **Passo 1. Descubra o seu IP local (no terminal do Host):**
   - **Linux (Fedora/Ubuntu):** Rode `hostname -I | awk '{print $1}'`
   - **Windows:** Rode `ipconfig` (procure por "IPv4 Address" na sua placa de rede ativa)

   **Passo 2. Acesse de outros aparelhos:**
   Se o seu IP for, por exemplo, `10.20.30.40`, os outros jogadores devem digitar:
   -> `http://10.20.30.40:5173`

   *Dica: Para testar de verdade abra duas abas como "Aba Convidado P1" e "Aba Anônima P2" e veja os WebSockets distribuídos voarem e se parearem.*

---

## Entendendo o Funcionamento Distribuído

Caso você queria adentrar a fundo na arquitetura de códigos do sistema de fila para o trabalho, acesse a pasta `backend/` e `frontend/` deste repositório. Ambos possuem um respectivo arquivo `README.md` técnico destrinchando como o uso conjunto do Socket.io Adaptor com o **Redis** faz o sistema escapar de limitações locais e tolerar múltiplas instâncias Node, servindo as premissas estudadas em Sistemas Distribuídos!
