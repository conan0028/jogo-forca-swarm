# Forca Distribuída - Frontend

Este repositório contém o código da interface do usuário (frontend) para o **Jogo da Forca Multiplayer Distribuído**. O cliente foi desenvolvido combinando gerenciamento de componentes moderno com renderização de jogos em Canvas, permitindo uma experiência híbrida rica e responsiva.

## 🛠 Tecnologias e Arquitetura

A aplicação frontend foi construída integrando as seguintes tecnologias:

### 1. React (UI e Gerenciamento de Estado Global)
O React atua como a espinha dorsal de todo o fluxo de telas que não requerem renderização complexa 2D:
- **Telas:** `Login`, `Lobby` (com Ranking em tempo real), Tela de `Regras`, e pop-ups de `Fila de Espera` ou `Desconexão do Oponente`.
- **Estado Reativo:** Recebe os pacotes do Node.js através de WebSockets e converte o JSON em estado React. A alteração desse estado desencadeia a atualização do teclado virtual na tela (`disabled` em letras já chutadas) e do cronômetro da rodada.

### 2. Phaser.js (Motor Gráfico 2D / Canvas)
Integrar a lógica de renderização constante do jogo usando React de forma nativa seria lento e engessado. Para isso, o **Phaser 3** toma controle exclusivo da cena do jogo dentro de um contexto isolado (`PhaserGame.jsx`).
- **Animações Atmosféricas (`GameScene.js`):** Um sistema avançado de Nuvens controla múltiplos *sprites*, velocidades infinitas horizontais, opacidades dinâmicas e profundidade contra o fundo, rodando independentemente dos *ticks* lógicos do Node.js puro.
- **Tensão Visual Dinâmica:** O céu não é uma imagem estática. O algoritmo analisa a contagem de `erros` vinda do servidor Node.js em tempo real. Com a iminência de fracasso no jogo (4 ou 5 erros), o Phaser altera dinamicamente a coloração hexadecimal do ambiente (`Azul` -> `Amarelo` -> `Vermelho`).
- **Comunicação Segura:** Recebe injeções de atributos vitais diretamente pelo *Hook* `updateGameState` injetado pelo pai (React).

### 3. Socket.io-client (Conexão Persistente Bi-direcional)
O módulo responsável por dar a vida ao multiplayer distribuído sem falhas pesadas de comunicação HTTP tradicional.
- **Eventos Orientados (`on` / `emit`):** Evita o uso pesado e demorado de requisições GET/POST convencionais. Ações como `play_letter`, `join_queue`, `match_annulled` ocorrem através de WebSockets instantaneamente.
- **Resiliência a Quedas:** Lida com reconexões ou encerramento temporário de sessões ativas atrelados com o UUID do Backend no Redis pela nuvem. 

### 4. CSS Moderno (Glassmorphism & UX)
Em vez de depender de *frameworks* robustos de mercado o projeto conta com CSS Vanila usando:
- Painéis foscos via propriedades como `backdrop-filter` ("Glassmorphism").
- *Micro-interações* de interatividade simulando botões modernos e gradientes animados. 
- Fades de subida ao logar ou mudar de interfaces complexas sem pesarem em processamento na GPU.

---

Para iniciar o servidor de desenvolvimento (HMR com Vite):
```bash
npm install
npm run dev
```
