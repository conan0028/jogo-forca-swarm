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

// ========== TELEMETRIA SWARM ==========
// Identidade do contêiner e da máquina física para o Dashboard de Controle
const CONTAINER_ID = os.hostname();
const NODE_NAME = process.env.NODE_NAME || 'Local';
const SERVER_LABEL = `${NODE_NAME} (${CONTAINER_ID.substring(0, 12)})`;
console.log(`[TELEMETRIA] Contêiner inicializado: ${SERVER_LABEL}`);

// Rota de Diagnóstico de Rede
app.get('/ping', (req, res) => {
    res.json({ 
        status: 'online', 
        serverID: os.hostname(), 
        time: new Date().toISOString(),
        node: process.version
    });
});

// Rota de Teste e Ranking (SEMPRE retorna um array JSON)
app.get('/ranking', async (req, res) => {
    try {
        const ranking = await db.getRanking();
        // Força retorno como array, mesmo se getRanking retornar algo inesperado
        res.json(Array.isArray(ranking) ? ranking : []);
    } catch (e) {
        console.error('[BACKEND] Erro crítico na rota /ranking:', e.message);
        // NUNCA retorna objeto de erro — sempre retorna array vazio
        res.json([]);
    }
});

// ========== ROTA DE TELEMETRIA ==========
// Retorna todos os usuários ativos com server, username e latência
app.get('/api/telemetry', async (req, res) => {
    try {
        const data = await pubClient.hgetall('active_users');
        const entries = Object.entries(data || {}).map(([socketId, rawValue]) => {
            try {
                const parsed = JSON.parse(rawValue);
                return { socketId, ...parsed };
            } catch {
                // Fallback para formato antigo (string simples)
                return { socketId, server: rawValue, username: 'Anônimo', latency: '?ms' };
            }
        });
        console.log(`[TELEMETRIA] Consulta: ${entries.length} conexões ativas`);
        res.json(entries);
    } catch (e) {
        console.error('[TELEMETRIA] Erro ao consultar active_users:', e.message);
        res.json([]);
    }
});

// Helper: atualiza campo específico da telemetria de um socket no Redis
async function updateTelemetryField(socketId, field, value) {
    try {
        const raw = await pubClient.hget('active_users', socketId);
        if (!raw) return;
        let obj;
        try { obj = JSON.parse(raw); } catch { obj = { server: SERVER_LABEL, username: 'Anônimo', latency: '0ms' }; }
        obj[field] = value;
        await pubClient.hset('active_users', socketId, JSON.stringify(obj));
    } catch (err) {
        console.error(`[TELEMETRIA] Erro ao atualizar ${field}:`, err.message);
    }
}

// Conexão do Socket
io.on('connection', async (socket) => {
    console.log(`[BACKEND] Novo cliente conectado: ${socket.id} de ${socket.handshake.address}`);

    // Registra no Redis Hash para telemetria do dashboard (payload JSON)
    try {
        const telemetryPayload = JSON.stringify({
            server: SERVER_LABEL,
            username: 'Anônimo',
            latency: '0ms'
        });
        await pubClient.hset('active_users', socket.id, telemetryPayload);
        console.log(`[TELEMETRIA] Registrado: ${socket.id} -> ${SERVER_LABEL}`);
    } catch (err) {
        console.error('[TELEMETRIA] Erro ao registrar socket:', err.message);
    }

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

        // Atualiza username na telemetria do dashboard
        await updateTelemetryField(socket.id, 'username', username);
        console.log(`[TELEMETRIA] Username atualizado: ${socket.id} -> ${username}`);

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

    // Cliente avisa que quer reconectar pra uma sala pausada (Ação Manual)
    socket.on('reconnect_attempt', async (data) => {
        const { roomId, username } = data;
        socket.username = username;

        // Re-mapeia o novo socket ID para a sala da qual ele retornou
        await pubClient.set(`forca:socket:${socket.id}:room`, roomId);
        await pubClient.set(`forca:socket:${socket.id}:user`, username);

        await gameLogic.handleReconnect(roomId, username, socket);
    });

    // Hydration: Reconexão Transparente (Ação Automática de Queda de Nó/Swarm)
    socket.on('restore_session', async (data) => {
        const { username, roomId } = data;
        if (!username) return;

        socket.username = username;
        await updateTelemetryField(socket.id, 'username', username);
        await pubClient.set(`forca:socket:${socket.id}:user`, username);

        if (roomId && roomId !== 'null') {
            await pubClient.set(`forca:socket:${socket.id}:room`, roomId);
            // Passa para o gameLogic como se fosse um reconnect manual normal
            await gameLogic.handleReconnect(roomId, username, socket);
            console.log(`[HYDRATION] ${username} reconectou transparente em ${roomId}`);
        } else {
            console.log(`[HYDRATION] ${username} reconectou transparente no lobby`);
        }
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

    // Heartbeat de latência para telemetria do Dashboard
    socket.on('ping_latency', async (clientTimestamp) => {
        const latency = Date.now() - clientTimestamp;
        await updateTelemetryField(socket.id, 'latency', `${latency}ms`);
    });

    socket.on('disconnect', async () => {
        console.log(`Usuario desconectado: ${socket.id} (${socket.username})`);

        // Remove do hash de telemetria
        try {
            await pubClient.hdel('active_users', socket.id);
            console.log(`[TELEMETRIA] Removido: ${socket.id}`);
        } catch (err) {
            console.error('[TELEMETRIA] Erro ao remover socket:', err.message);
        }

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
