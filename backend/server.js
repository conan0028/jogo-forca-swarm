const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { createAdapter } = require('@socket.io/redis-adapter');
const Redis = require('ioredis');
const cors = require('cors');
const os = require('os');

const db = require('./database');
const gameLogic = require('./gameLogic');

const app = express();
app.use(cors());
app.use(express.json());

const server = http.createServer(app);
const io = new Server(server, {
    cors: { origin: "*", methods: ["GET", "POST"] }
});

// Redis Clients (Um pra publicar, outro pra escutar conforme doc do adapter)
const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
const pubClient = new Redis(redisUrl);
const subClient = pubClient.duplicate();

pubClient.on('error', (err) => console.error('[REDIS CRITICAL ERROR] PubClient:', err.message));
subClient.on('error', (err) => console.error('[REDIS CRITICAL ERROR] SubClient:', err.message));
pubClient.on('connect', () => console.log('[SUCCESS] Redis PubClient Conectado!'));
subClient.on('connect', () => console.log('[SUCCESS] Redis SubClient Conectado!'));

// Usa o adaptador do Redis para escalar multiplas instâncias do Node.js
io.adapter(createAdapter(pubClient, subClient));

// Inicializa no gameLogic as referencias do IO e o cliente Redis pra estado/fila
gameLogic.init(io, pubClient);

// Rota de Diagnóstico de Rede
app.get('/ping', (req, res) => {
    res.json({ 
        status: 'online', 
        serverID: os.hostname(), 
        time: new Date().toISOString(),
        node: process.version
    });
});

// Rota de Teste e Ranking
app.get('/ranking', async (req, res) => {
    try {
        const ranking = await db.getRanking();
        res.json(ranking);
    } catch (e) {
        res.status(500).json({ error: 'Erro no Ranking' });
    }
});

// Conexão do Socket
io.on('connection', (socket) => {
    console.log(`[BACKEND] Novo cliente conectado: ${socket.id} de ${socket.handshake.address}`);

    // Cliente pede pra entrar na fila
    socket.on('join_queue', async (data) => {
        const { username } = data;
        if (!username) return;

        socket.username = username; // guardamos sessao simples mem
        await gameLogic.joinQueue(socket.id, username);
    });

    // Cliente desiste de procurar partida (timer esgotou / cancelou)
    socket.on('leave_queue', async (data) => {
        const { username } = data;
        if (socket.username) {
            await gameLogic.leaveQueue(socket.id, username);
        }
    });

    // Cliente joga uma letra ou chuta palavra
    socket.on('play_letter', async (data) => {
        const { roomId, input, isSuddenDeath } = data;
        if (socket.username && roomId && input) {
            await gameLogic.processPlay(roomId, socket.username, input, isSuddenDeath);
        }
    });

    // Verifica se há jogo ativo ao logar
    socket.on('check_active_game', async (data) => {
        const { username } = data;
        socket.username = username;

        const roomId = await pubClient.get(`forca:user:${username}:room`);
        if (roomId) {
            const state = await gameLogic.loadState(roomId);
            if (state && (state.status === 'paused' || state.status === 'playing')) {
                socket.emit('active_game_found', { roomId });
                return;
            }
            // Limpa se estiver finished ou não existir
            await pubClient.del(`forca:user:${username}:room`);
        }
        socket.emit('no_active_game');
    });

    // Cliente decide desistir da partida pendente
    socket.on('surrender_game', async (data) => {
        const { roomId, username } = data;
        await gameLogic.handleSurrender(roomId, username);
    });

    // Cliente abandona voluntariamente a sala em andamento sem pontuações
    socket.on('abandon_match', async (data) => {
        const { roomId, username } = data;
        await gameLogic.handleAbandonMatch(roomId, username);
    });

    // Cliente avisa que quer reconectar pra uma sala pausada
    socket.on('reconnect_attempt', async (data) => {
        const { roomId, username } = data;
        socket.username = username;

        // Re-mapeia o novo socket ID para a sala da qual ele retornou
        await pubClient.set(`forca:socket:${socket.id}:room`, roomId);
        await pubClient.set(`forca:socket:${socket.id}:user`, username);

        await gameLogic.handleReconnect(roomId, username, socket);
    });

    // Jogador sinaliza que o Phaser terminou de carregar e está pronto
    socket.on('player_ready', async (data) => {
        const { roomId, username } = data;
        if (roomId && username) {
            await gameLogic.playerReady(roomId, username);
        }
    });

    // Ping / Pong para cálculo de latência (UI Frontend)
    socket.on('toggle_ping', (clientTimestamp) => {
        socket.emit('pong', clientTimestamp);
    });

    socket.on('disconnect', async () => {
        console.log(`Usuario desconectado: ${socket.id} (${socket.username})`);

        // Recupera o mapeamento de sala usando o Redis
        const roomId = await pubClient.get(`forca:socket:${socket.id}:room`);
        const username = await pubClient.get(`forca:socket:${socket.id}:user`);

        if (roomId && username) {
            await gameLogic.handleDisconnect(roomId, username);
            // Limpa as referências deste socket específico que acabou de morrer
            await pubClient.del(`forca:socket:${socket.id}:room`);
            await pubClient.del(`forca:socket:${socket.id}:user`);
        } else if (socket.username) {
            // Pode estar na fila aguardando match
            await gameLogic.leaveQueue(socket.id, socket.username);
        }
    });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, '0.0.0.0', () => {
    console.log(`[BACKEND] Servidor HTTP/Socket.io rodando na porta ${PORT} (bind: 0.0.0.0)`);
});
