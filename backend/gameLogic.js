const crypto = require('crypto');
const os = require('os');

const db = require('./database');

// Helper para normalizar acentos
function normalizeStr(str) {
    return str.normalize('NFD').replace(/[\u0300-\u036f]/g, "");
}

const WORDS = [
    { palavra: "MAÇÃ", categoria: "FRUTA" },
    { palavra: "ABACAXI", categoria: "FRUTA" },
    { palavra: "LARANJA", categoria: "FRUTA" },
    { palavra: "CACHORRO", categoria: "ANIMAL" },
    { palavra: "ONÇA", categoria: "ANIMAL" },
    { palavra: "COMPUTADOR", categoria: "TECNOLOGIA" },
    { palavra: "BRASIL", categoria: "PAIS" },
    { palavra: "REACT", categoria: "TECNOLOGIA" },
    { palavra: "FUTEBOL", categoria: "ESPORTE" },
    { palavra: "BASQUETE", categoria: "ESPORTE" },
    { palavra: "GATO", categoria: "ANIMAL" }
];

// Map local de timers para podermos limpar/iniciar em cada Node.js local.
// Como o Socket.io usa redis-adapter, io.to(roomId) emitirá para outras instâncias, mas o 
// processamento do timer (setInterval) fica associado à instância Node onde o jogo iniciou.
const roomTimers = new Map();
let ioInstance;
let redisClient;

function init(io, redis) {
    ioInstance = io;
    redisClient = redis;
}

/**
 * Adiciona um jogador na fila e verifica se podemos iniciar uma partida.
 */
async function joinQueue(socketId, username) {
    // Garante que o usuário existe no SQLite
    await db.ensureUser(username);

    // Enfileira usando Redis (Rpush)
    const playerData = JSON.stringify({ socketId, username });
    await redisClient.rpush('forca:queue', playerData);

    // Tenta sacar 2 para ver se há match
    // Usamos LLen para ver tamanho. Num cenário altamente distribuído com muita concorrência,
    // usaria scripts LUA para atamicidade, mas comandos básicos com IF suffice aqui.
    const queueLen = await redisClient.llen('forca:queue');
    if (queueLen >= 2) {
        // Tentamos remover 2 atômicamente (poderia ser feito via multi/exec)
        const p1Raw = await redisClient.lpop('forca:queue');
        const p2Raw = await redisClient.lpop('forca:queue');

        if (p1Raw && p2Raw) {
            const p1 = JSON.parse(p1Raw);
            const p2 = JSON.parse(p2Raw);
            await createRoom(p1, p2);
        } else {
            // Se sacamos um e não tinha outro (race condition), devolvemos
            if (p1Raw) await redisClient.rpush('forca:queue', p1Raw);
            if (p2Raw) await redisClient.rpush('forca:queue', p2Raw);
        }
    }
}

/**
 * Remove da fila manual ou por timeout
 */
async function leaveQueue(socketId, username) {
    const playerData = JSON.stringify({ socketId, username });
    await redisClient.lrem('forca:queue', 0, playerData);
}

/**
 * Cria a sala com 2 jogadores
 */
async function createRoom(p1, p2) {
    const roomId = crypto.randomUUID();
    const wordObj = WORDS[Math.floor(Math.random() * WORDS.length)];

    let initialMasked = '';
    for (let char of wordObj.palavra) {
        if (char === ' ' || char === '-') initialMasked += char;
        else initialMasked += '_';
    }

    const state = {
        roomId,
        word: wordObj.palavra,
        hint: wordObj.categoria,
        guesses: JSON.stringify([]),
        errors: 0,
        status: 'playing',
        timeLeft: 30, // 30s por turno
        turn: Math.random() < 0.5 ? p1.username : p2.username,
        p1: p1.username, p2: p2.username,
        p1Score: 0, p2Score: 0,
        maskedWord: initialMasked
    };

    await saveState(roomId, state);

    // Mapeamento de Sessão para gerenciar Quedas e Reconexões
    await redisClient.set(`forca:socket:${p1.socketId}:room`, roomId);
    await redisClient.set(`forca:socket:${p1.socketId}:user`, p1.username);
    await redisClient.set(`forca:socket:${p2.socketId}:room`, roomId);
    await redisClient.set(`forca:socket:${p2.socketId}:user`, p2.username);

    // Mapeamento User -> Sala (Para verificar se há jogo ativo no login)
    await redisClient.set(`forca:user:${p1.username}:room`, roomId);
    await redisClient.set(`forca:user:${p2.username}:room`, roomId);

    // Faz os Sockets se juntarem à sala do Socket.IO (os adapters espalharão isso se precisarem)
    const sockets = await ioInstance.in([p1.socketId, p2.socketId]).fetchSockets();
    for (const socket of sockets) {
        socket.join(roomId);
        // Avisa os players passando UUID e Oponente
        socket.emit('match_found', {
            roomId,
            opponent: socket.id === p1.socketId ? p2.username : p1.username
        });
    }

    // NÃO inicia o timer aqui! Aguarda ambos os jogadores sinalizarem player_ready.
    broadcastState(roomId);
}

/**
 * Lógica de processamento de Letra ou Chute
 */
async function processPlay(roomId, username, playValue, isSuddenDeath = false) {
    const state = await loadState(roomId);
    if (!state || state.status !== 'playing' || state.turn !== username) return;

    playValue = playValue.toUpperCase();
    const isFullGuess = playValue.length > 1;
    let guesses = JSON.parse(state.guesses);

    let madeCorrectMove = false;
    let earnedPoints = 0;

    const normSecret = normalizeStr(state.word);

    // Calcula pontos e mascaras
    if (isFullGuess) {
        if (normalizeStr(playValue) === normSecret) {
            // Chute direto certo (+100)
            state.maskedWord = state.word;
            earnedPoints = 100;
            madeCorrectMove = true;
        } else {
            // Errou feio o chute
            state.errors = parseInt(state.errors) + 1;
        }
    } else {
        const letter = playValue[0];
        if (!guesses.includes(letter)) {
            guesses.push(letter);
            state.guesses = JSON.stringify(guesses);

            if (normSecret.includes(letter)) {
                // Acertou a Letra (+10)
                earnedPoints = 10;
                madeCorrectMove = true;

                // Atualiza palavra mascarada
                let newMasked = '';
                for (let i = 0; i < state.word.length; i++) {
                    const char = state.word[i];
                    if (char === ' ' || char === '-') {
                        newMasked += char;
                    } else {
                        const normChar = normalizeStr(char);
                        newMasked += (guesses.includes(normChar)) ? char : '_';
                    }
                }
                state.maskedWord = newMasked;

                // Se completou a palavra inteira pedaço por pedaço (+50)
                if (state.maskedWord === state.word) {
                    earnedPoints += 50;
                    if (isSuddenDeath) earnedPoints += 30; // Bônus Chutar Palavra
                }
            } else {
                if (isSuddenDeath) {
                    state.errors = 6; // Insta-loss
                } else {
                    state.errors = parseInt(state.errors) + 1;
                }
            }
        }
    }

    // Aloca pontuação para o turno do cara
    if (state.p1 === username) state.p1Score = parseInt(state.p1Score) + earnedPoints;
    if (state.p2 === username) state.p2Score = parseInt(state.p2Score) + earnedPoints;

    // Checa Win / Game Over
    if (state.maskedWord === state.word) {
        stopTimer(roomId); // Para o timer ANTES de salvar para evitar race condition
        state.status = 'finished';
        await saveState(roomId, state);
        broadcastState(roomId, state);
        return handleGameOver(roomId, state.word, state.p1, state.p1Score, state.p2, state.p2Score, username);
    }

    if (parseInt(state.errors) >= 6) {
        stopTimer(roomId);
        state.status = 'finished';
        state.maskedWord = state.word;
        await saveState(roomId, state);
        broadcastState(roomId, state);
        const winner = state.p1 === username ? state.p2 : state.p1;
        const reason = isSuddenDeath ? 'sudden_death_fail' : 'max_errors';
        return handleGameOver(roomId, state.word, state.p1, state.p1Score, state.p2, state.p2Score, winner, reason);
    }

    // Passa turno
    if (!(isSuddenDeath && madeCorrectMove)) {
        state.turn = state.turn === state.p1 ? state.p2 : state.p1;
    }
    state.timeLeft = 30; // Reseta o tempo!

    await saveState(roomId, state);
    broadcastState(roomId);
}

/**
 * Handle game over and persist to SQLite
 */
async function handleGameOver(roomId, word, p1, p1Score, p2, p2Score, winner, reason = 'normal') {
    stopTimer(roomId);

    // Garante que o evento chegue aos jogadores imediatamente para liberar a UI
    try {
        ioInstance.to(roomId).emit('game_over', {
            winner,
            word,
            p1Score: parseInt(p1Score) || 0,
            p2Score: parseInt(p2Score) || 0,
            reason
        });
    } catch (err) {
        console.error("Erro ao emitir game_over:", err);
    }

    try {
        // Tenta atualizar o ranking no SQLite
        await db.addScore(p1, Math.max(0, parseInt(p1Score)));
        await db.addScore(p2, Math.max(0, parseInt(p2Score)));
    } catch (error) {
        console.error("Erro ao salvar pontuação no banco de dados:", error);
    }

    // Limpa estado no Redis por último
    try {
        await redisClient.del(`forca:room:${roomId}`);
        await redisClient.del(`forca:room:${roomId}:ready`);
        await redisClient.del(`forca:user:${p1}:room`);
        await redisClient.del(`forca:user:${p2}:room`);
        // Nota: a chave :ready já é incluída na limpeza
    } catch (e) {
        console.error("Erro ao limpar Redis após fim de jogo:", e);
    }
}

/**
 * Lida com desconexão (Pausa o jogo e inicia conta 30s)
 */
async function handleDisconnect(roomId, username) {
    const state = await loadState(roomId);
    if (!state || state.status === 'finished') return;

    state.status = 'paused';
    state.pausedBy = username;
    state.pausedTimeLeft = 30; // 30s pra voltar W.O.
    await saveState(roomId, state);

    ioInstance.to(roomId).emit('opponent_disconnected', {
        timeout: 30,
        message: `Oponente caiu! Aguardando retorno (30s)...`
    });

    // Troca o timer normal pelo de Pause
    stopTimer(roomId);

    // Timeout timer logic - Resiliência para W.O
    const waitInterval = setInterval(async () => {
        let st = await loadState(roomId);
        if (!st || st.status !== 'paused') {
            clearInterval(waitInterval);
            return;
        }

        st.pausedTimeLeft = parseInt(st.pausedTimeLeft) - 1;
        await saveState(roomId, st);

        if (st.pausedTimeLeft <= 0) {
            clearInterval(waitInterval);

            // Partida é anulada em caso de W.O sem volta do servidor/oponente
            st.status = 'finished';
            await saveState(roomId, st);

            ioInstance.to(roomId).emit('match_annulled', {
                message: "A conexão do oponente caiu permanentemente. A partida foi anulada e nenhum ponto foi gravado."
            });

            await redisClient.del(`forca:room:${roomId}`);
            await redisClient.del(`forca:room:${roomId}:ready`);
            await redisClient.del(`forca:user:${st.p1}:room`);
            await redisClient.del(`forca:user:${st.p2}:room`);
        } else {
            broadcastState(roomId, st);
        }
    }, 1000);

    // Guardamos o timer de pause na mesma map para limpar no reconect
    roomTimers.set(`${roomId}_paused`, waitInterval);
}

/**
 * Reconectar
 */
async function handleReconnect(roomId, username, socket) {
    const state = await loadState(roomId);
    if (!state) return;

    socket.join(roomId);

    if (state.status === 'paused' && state.pausedBy === username) {
        state.status = 'playing';
        await saveState(roomId, state);

        // Limpa o de pause
        const pt = roomTimers.get(`${roomId}_paused`);
        if (pt) {
            clearInterval(pt);
            roomTimers.delete(`${roomId}_paused`);
        }

        // Avisa que voltou
        ioInstance.to(roomId).emit('opponent_reconnected', {
            message: `Oponente reconectou e retomou a partida!`
        });

        // Retoma o timer normal!
        startTimer(roomId);
        broadcastState(roomId);
    } else {
        // Alguem logou e ja tava rodando (espectador/re-sync)
        socket.emit('game_state', formatPublicState(state));
    }
}

/**
 * Utilitários Redis State & Timers
 */
async function saveState(roomId, state) {
    // Pipeline ou set multiplos para HSET
    await redisClient.hmset(`forca:room:${roomId}`, state);
}

async function loadState(roomId) {
    const res = await redisClient.hgetall(`forca:room:${roomId}`);
    return Object.keys(res).length > 0 ? res : null;
}

function stopTimer(roomId) {
    const timer = roomTimers.get(roomId);
    if (timer) {
        clearInterval(timer);
        roomTimers.delete(roomId);
    }
}

function startTimer(roomId) {
    stopTimer(roomId); // limpa anterior se houver

    const timer = setInterval(async () => {
        const state = await loadState(roomId);
        if (!state || state.status !== 'playing') {
            stopTimer(roomId);
            return;
        }

        let timeLeft = parseInt(state.timeLeft) - 1;
        let newTurn = state.turn;

        if (timeLeft <= 0) {
            // Tempo esgotado! Passa turno
            newTurn = state.turn === state.p1 ? state.p2 : state.p1;
            timeLeft = 30; // reseta
        }

        // Atualiza SOMENTE os campos de controle de turno/tempo para não
        // sobrescrever campos críticos (status, errors, maskedWord) salvos
        // concorrentemente pelo processPlay.
        await redisClient.hmset(`forca:room:${roomId}`, {
            timeLeft,
            turn: newTurn
        });

        // Relê o estado completo para o broadcast (garante consistência)
        const freshState = await loadState(roomId);
        if (!freshState || freshState.status !== 'playing') {
            stopTimer(roomId);
            return;
        }

        // Emite ticks para a sala
        broadcastState(roomId, freshState);

    }, 1000);

    roomTimers.set(roomId, timer);
}

async function broadcastState(roomId, s = null) {
    const state = s || await loadState(roomId);
    if (state) {
        ioInstance.to(roomId).emit('game_state', formatPublicState(state));
    }
}

function formatPublicState(state) {
    return {
        roomId: state.roomId,
        status: state.status,
        hint: state.hint,
        maskedWord: state.maskedWord,
        guesses: JSON.parse(state.guesses),
        errors: parseInt(state.errors),
        timeLeft: parseInt(state.timeLeft),
        pausedTimeLeft: state.pausedTimeLeft ? parseInt(state.pausedTimeLeft) : 0,
        turn: state.turn,
        p1: state.p1, p2: state.p2,
        p1Score: parseInt(state.p1Score),
        p2Score: parseInt(state.p2Score),
        serverID: os.hostname() // Identifica o container/nó
    };
}

/**
 * Lida com desistência manual da partida pausada/ativa
 */
async function handleSurrender(roomId, username) {
    const state = await loadState(roomId);
    if (!state || state.status === 'finished') return;

    // Pausa eventuais timers
    stopTimer(roomId);
    const pt = roomTimers.get(`${roomId}_paused`);
    if (pt) {
        clearInterval(pt);
        roomTimers.delete(`${roomId}_paused`);
    }

    // Vence por Desistência! Ignorando pontos pre-existentes no jogo
    const winner = state.p1 === username ? state.p2 : state.p1;
    if (state.p1 === winner) {
        state.p1Score = 50;
        state.p2Score = 0;
    } else {
        state.p2Score = 50;
        state.p1Score = 0;
    }

    state.status = 'finished';
    state.maskedWord = state.word;
    await saveState(roomId, state);
    broadcastState(roomId, state);

    await handleGameOver(roomId, state.word, state.p1, state.p1Score, state.p2, state.p2Score, winner, 'surrender');
}

/**
 * Lida com o Abandono voluntário durante o jogo ativo
 */
async function handleAbandonMatch(roomId, username) {
    // Age da exata mesma foma como render-se: O outro ganha os 30pts e é exibido a tela Vítoria
    await handleSurrender(roomId, username);
}

/**
 * Jogador sinalizou que o Phaser terminou de carregar e está pronto.
 * Quando ambos os jogadores da sala estiverem prontos, inicia o timer.
 */
async function playerReady(roomId, username) {
    const state = await loadState(roomId);
    if (!state || state.status !== 'playing') return;

    // Usa um Set no Redis para rastrear quem está pronto
    const readyKey = `forca:room:${roomId}:ready`;
    await redisClient.sadd(readyKey, username);
    const readyCount = await redisClient.scard(readyKey);

    if (readyCount >= 2) {
        // Ambos prontos! Reseta o tempo para 30s e inicia o timer
        state.timeLeft = 30;
        await saveState(roomId, state);
        broadcastState(roomId, state);
        startTimer(roomId);

        // Limpa a chave de ready (não precisa mais)
        await redisClient.del(readyKey);
    }
}

module.exports = {
    init,
    joinQueue,
    leaveQueue,
    processPlay,
    loadState,
    handleDisconnect,
    handleReconnect,
    handleSurrender,
    handleAbandonMatch,
    playerReady
};
