import { useState, useEffect, useRef } from 'react';
import { io } from 'socket.io-client';
import PhaserGame from './components/PhaserGame';
import AdminMonitor from './components/AdminMonitor';
import './index.css';

const SERVER_URL = `http://${window.location.hostname}:3001`;

export default function App() {
  const [socket, setSocket] = useState(null);
  const [username, setUsername] = useState('');
  const [view, setView] = useState('login'); // login, lobby, game
  const [statusMsg, setStatusMsg] = useState('');
  const [isSuddenDeathMode, setIsSuddenDeathMode] = useState(false);

  // Game State
  const [gameState, setGameState] = useState(null);
  const [ping, setPing] = useState(0);
  const [ranking, setRanking] = useState([]);
  const [opponentDisconnectMsg, setOpponentDisconnectMsg] = useState('');
  const [opponentReconnectedMsg, setOpponentReconnectedMsg] = useState('');
  const [pendingRoomId, setPendingRoomId] = useState('');
  const [gameResult, setGameResult] = useState(null);

  // Connection & Setup
  useEffect(() => {
    const newSocket = io(`http://${window.location.hostname}:3001`, { autoConnect: false });
    setSocket(newSocket);

    // Latency Ping System
    let pingInterval;
    newSocket.on('connect', () => {
      if (pingInterval) clearInterval(pingInterval); // Previne vazamento em reconexões
      pingInterval = setInterval(() => {
        newSocket.emit('toggle_ping', Date.now());
      }, 2000);
    });

    newSocket.on('pong', (clientTime) => {
      setPing(Date.now() - clientTime);
    });

    newSocket.on('match_found', (data) => {
      setQueueTimerLeft(0);
      setStatusMsg(`Jogador encontrado... Entrando na sala!`);
      // Adicionamos um jitter aleatório para evitar picos de CPU quando várias salas abrem no mesmo microsegundo
      const jitter = Math.floor(Math.random() * 801); 
      setTimeout(() => {
        setView('game');
        setGameResult(null);
        setIsSuddenDeathMode(false);
        setOpponentDisconnectMsg('');
        setOpponentReconnectedMsg('');
        setStatusMsg('');
      }, 3000 + jitter);
    });

    newSocket.on('active_game_found', (data) => {
      setPendingRoomId(data.roomId);
      setView('reconnectPrompt');
    });

    newSocket.on('no_active_game', () => {
      setView('lobby');
      // eslint-disable-next-line
      fetchRanking().catch(console.error);
    });

    newSocket.on('game_state', (state) => {
      setGameState(state);
      if (state.status === 'playing') setOpponentDisconnectMsg('');
    });

    newSocket.on('opponent_disconnected', (data) => {
      setOpponentDisconnectMsg(data.message || 'Oponente caiu! Aguardando...');
    });

    newSocket.on('opponent_reconnected', (data) => {
      setOpponentDisconnectMsg('');
      setOpponentReconnectedMsg(data.message || 'Oponente retornou!');
      setTimeout(() => setOpponentReconnectedMsg(''), 4000);
    });

    newSocket.on('game_over', (data) => {
      setGameResult(data);
    });

    newSocket.on('match_annulled', (data) => {
      alert(data.message || 'Partida anulada devido a queda na conexão.');
      setView('lobby');
      setGameResult(null);
      setOpponentDisconnectMsg('');
      setGameState(null);
      // eslint-disable-next-line
      fetchRanking().catch(console.error);
    });

    return () => {
      clearInterval(pingInterval);
      newSocket.disconnect();
    };
  }, []);

  // Reseta estado local de morte súbita quando perde o turno
  useEffect(() => {
    if (gameState && gameState.turn !== username) {
      setIsSuddenDeathMode(false);
    }
  }, [gameState, username]);

  const fetchRanking = async () => {
    try {
      const res = await fetch(`${SERVER_URL}/ranking`);
      const data = await res.json();
      setRanking(data);
    } catch (e) {
      console.error(e);
    }
  };

  const handleLogin = (e) => {
    e.preventDefault();
    if (username.trim().length > 2) {
      socket.connect();
      socket.emit('check_active_game', { username: username.toUpperCase() });
    }
  };

  const [queueTimerLeft, setQueueTimerLeft] = useState(0);

  useEffect(() => {
    let interval;
    if (queueTimerLeft > 0) {
      interval = setInterval(() => {
        setQueueTimerLeft((prev) => {
          if (prev <= 1) {
            socket.emit('leave_queue', { username: username.toUpperCase() });
            setStatusMsg('Nenhum adversário encontrado no momento.');
            setTimeout(() => setStatusMsg(''), 4000);
            return 0;
          }
          setStatusMsg(`Aguardando adversário... (${prev - 1}s)`);
          return prev - 1;
        });
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [queueTimerLeft, socket, username]);

  const joinQueue = () => {
    setStatusMsg(`Aguardando adversário... (45s)`);
    setQueueTimerLeft(45);
    socket.emit('join_queue', { username: username.toUpperCase() });
  };

  const handleLogout = () => {
    socket.disconnect();
    setUsername('');
    setView('login');
  };

  const sendLetter = (letter) => {
    if (!gameState || gameState.turn !== username) return;
    socket.emit('play_letter', { roomId: gameState.roomId, input: letter, isSuddenDeath: isSuddenDeathMode });
  };

  const toggleSuddenDeath = () => {
    setIsSuddenDeathMode(!isSuddenDeathMode);
  };

  // Renders
  if (view === 'login') {
    return (
      <div className="screen-container">
        <div className="glass-panel fade-in" style={{ width: '100%', maxWidth: '400px' }}>
          <h1 className="title-glow">Forca Distribuída</h1>
          <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div>
              <label style={{ color: 'var(--text-secondary)', marginBottom: '0.5rem', display: 'block' }}>Username</label>
              <input
                type="text"
                className="input-modern"
                value={username}
                onChange={e => setUsername(e.target.value.toUpperCase())}
                placeholder="Insira seu apelido..."
                required
              />
            </div>
            <button type="submit" className="btn-modern">Entrar</button>
          </form>
        </div>
      </div>
    );
  }

  if (view === 'lobby') {
    return (
      <div className="screen-container">
        <div className="glass-panel fade-in" style={{ width: '100%', maxWidth: '500px' }}>
          <h2 style={{ textAlign: 'center', marginBottom: '1rem' }}>Lobby Principal</h2>
          <div className="stat-box" style={{ marginBottom: '1.5rem' }}>
            <span className="stat-label">Jogador</span>
            <span className="stat-value">{username}</span>
          </div>

          {statusMsg && (
            <div className="fade-in" style={{ padding: '0.8rem', background: 'rgba(16, 185, 129, 0.1)', border: '1px solid var(--success)', borderRadius: '8px', marginBottom: '1.5rem', textAlign: 'center', color: 'var(--success)', fontWeight: 'bold' }}>
              {statusMsg}
            </div>
          )}

          <div style={{ display: 'flex', gap: '1rem' }}>
            <button onClick={joinQueue} className="btn-modern" disabled={!!statusMsg} style={{ flex: 1, background: statusMsg ? 'var(--bg-secondary)' : 'linear-gradient(135deg, #10b981, #059669)' }}>
              Procurar Partida
            </button>
            <button onClick={() => setView('rules')} className="btn-modern" disabled={!!statusMsg} style={{ flex: 1, background: statusMsg ? 'var(--bg-secondary)' : 'linear-gradient(135deg, #3b82f6, #2563eb)' }}>
              Regras
            </button>
            <button onClick={handleLogout} className="btn-modern" disabled={!!statusMsg} style={{ flex: 1, background: statusMsg ? 'var(--bg-secondary)' : 'linear-gradient(135deg, #ef4444, #dc2626)' }}>
              Sair
            </button>
          </div>

          <h3 style={{ marginTop: '2rem', marginBottom: '1rem' }}>Troféus da Morte (Rank)</h3>
          <ul className="ranking-list">
            {ranking.map((user, idx) => (
              <li key={idx} className="ranking-item">
                <span>{idx + 1}. {user.username}</span>
                <span style={{ color: 'var(--accent-color)', fontWeight: 'bold' }}>{user.score} pts</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    );
  }

  if (view === 'rules') {
    return (
      <div className="screen-container">
        <div className="glass-panel fade-in screen-scrollable" style={{ width: '100%', maxWidth: '650px', maxHeight: '85vh', overflowY: 'auto', padding: '2rem' }}>
          <h2 className="title-glow" style={{ textAlign: 'center', marginBottom: '1.5rem', color: '#3b82f6', fontSize: '2.5rem' }}>Regras do Jogo</h2>

          <div style={{ lineHeight: '1.6', color: 'var(--text-secondary)', fontSize: '1.1rem' }}>
            <h3 style={{ color: '#f8fafc', marginBottom: '0.5rem', borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '0.3rem' }}>1. Objetivo</h3>
            <p style={{ marginBottom: '1.5rem' }}>O objetivo do jogo é descobrir a palavra oculta antes que o boneco da forca seja completamente desenhado. Dois jogadores se enfrentam em turnos alternados, competindo para revelar a palavra e acumular pontos.</p>

            <h3 style={{ color: '#f8fafc', marginBottom: '0.5rem', borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '0.3rem' }}>2. Turnos</h3>
            <p style={{ marginBottom: '1.5rem' }}>O jogo é jogado em turnos alternados entre dois jogadores. Cada jogador tem até <strong>30 segundos</strong> para escolher uma letra. Se o tempo da sua rodada esgotar, o turno passa para o adversário automaticamente.</p>

            <h3 style={{ color: '#f8fafc', marginBottom: '0.5rem', borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '0.3rem' }}>3. Pontuação</h3>
            <ul style={{ paddingLeft: '1.5rem', marginBottom: '1.5rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              <li><strong style={{ color: '#10b981' }}>+10 pontos:</strong> Ao acertar uma letra que existe na palavra.</li>
              <li><strong style={{ color: '#10b981' }}>+30 pontos (bônus):</strong> Ao completar a palavra inteira usando o modo <em>Chutar Palavra</em> (Morte Súbita).</li>
              <li><strong style={{ color: '#10b981' }}>+50 pontos (bônus):</strong> Concedidos ao vencedor da partida ao final do jogo.</li>
            </ul>

            <h3 style={{ color: '#f8fafc', marginBottom: '0.5rem', borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '0.3rem' }}>4. Morte Súbita (Chutar Palavra)</h3>
            <p style={{ marginBottom: '1.5rem' }}>
              Durante o seu turno, se você achar que já sabe qual é a palavra, pode ativar o botão <strong>"Chutar Palavra"</strong> localizado acima do teclado.
              <br /><br />
              Nesse modo, caso você clique e acerte a próxima letra, o seu turno <strong>NÃO</strong> termina — você poderá continuar clicando nas letras até completar a palavra.
              Se você completar a palavra toda dentro desse modo, ganhará um bônus de <strong>+30 pontos</strong> além dos pontos por letras acertadas.
              <br /><br />
              <strong style={{ color: '#ef4444' }}>CUIDADO:</strong> Se você ativar este modo e clicar em uma única letra errada que não pertença à palavra, você sofrerá o enforcamento e <strong>perderá a partida instantaneamente!</strong>
            </p>

            <h3 style={{ color: '#f8fafc', marginBottom: '0.5rem', borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '0.3rem' }}>5. Abandono de Partida</h3>
            <p style={{ marginBottom: '1.5rem' }}>
              Se um jogador decidir abandonar a partida voluntariamente, o jogo é encerrado imediatamente.
              O jogador que permaneceu na sala recebe apenas os <strong>50 pontos de bônus pela vitória</strong> — todos os demais pontos acumulados durante a partida são descartados.
            </p>

            <h3 style={{ color: '#f8fafc', marginBottom: '0.5rem', borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '0.3rem' }}>6. Desconexão</h3>
            <p style={{ marginBottom: '1.5rem' }}>
              Se o seu adversário fechar o navegador ou perder a conexão durante a partida, o jogo será pausado e você aguardará até <strong>30 segundos</strong> pelo retorno dele.
              <br /><br />
              <strong style={{ color: '#f59e0b' }}>Se o adversário não voltar:</strong> A partida é <strong>anulada</strong> e nenhum ponto é salvo para nenhum dos jogadores.
              <br /><br />
              <strong style={{ color: '#10b981' }}>Se o adversário voltar e decidir desistir:</strong> O jogador que permaneceu na sala recebe <strong>50 pontos</strong> como bônus de vitória.
            </p>
          </div>

          <button
            onClick={() => setView('lobby')}
            className="btn-modern"
            style={{ width: '100%', marginTop: '1.5rem', padding: '1rem', fontSize: '1.1rem' }}
          >
            Voltar ao Lobby
          </button>
        </div>
      </div>
    );
  }

  if (view === 'reconnectPrompt') {
    return (
      <div className="screen-container">
        <div className="glass-panel fade-in" style={{ width: '100%', maxWidth: '500px', textAlign: 'center', padding: '2rem' }}>
          <h2 style={{ color: '#f59e0b', marginBottom: '1rem', fontSize: '2rem' }}>Partida em Andamento!</h2>
          <p style={{ color: 'var(--text-secondary)', marginBottom: '2rem', fontSize: '1.2rem' }}>
            Você fechou a página durante uma partida ativa. Deseja retornar ao jogo ou conceder a vitória por desistência?
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <button
              onClick={() => {
                socket.emit('reconnect_attempt', { roomId: pendingRoomId, username: username.toUpperCase() });
                setView('game');
                setOpponentDisconnectMsg('');
              }}
              className="btn-modern"
              style={{ background: 'linear-gradient(135deg, #10b981, #059669)', fontSize: '1.2rem', padding: '1rem' }}
            >
              Retornar à Partida
            </button>
            <button
              onClick={() => {
                socket.emit('surrender_game', { roomId: pendingRoomId, username: username.toUpperCase() });
                setView('lobby');
                // eslint-disable-next-line
                fetchRanking().catch(console.error);
              }}
              className="btn-modern"
              style={{ background: 'linear-gradient(135deg, #ef4444, #dc2626)', fontSize: '1.2rem', padding: '1rem' }}
            >
              Desistir e Ir para o Lobby
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (view === 'monitor') {
    return <AdminMonitor socket={socket} />;
  }

  // GAME VIEW
  return (
    <>

      {gameResult && (
        <div className="fade-in" style={{
          position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh',
          background: 'rgba(15, 23, 42, 0.90)', backdropFilter: 'blur(10px)',
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          zIndex: 999999
        }}>
          {username === gameResult.winner ? (
            <h1 style={{ color: '#10b981', fontSize: '4rem', textShadow: '0 0 20px #10b981', marginBottom: '1rem', textAlign: 'center' }}>
              PARABÉNS! VOCÊ VENCEU! 🏆
            </h1>
          ) : (
            <h1 style={{ color: '#ef4444', fontSize: '4rem', textShadow: '0 0 20px #ef4444', marginBottom: '1rem', textAlign: 'center' }}>
              VOCÊ PERDEU! 💀
            </h1>
          )}

          {username !== gameResult.winner && gameResult.reason === 'sudden_death_fail' && (
            <p style={{ color: '#f59e0b', fontSize: '1.5rem', marginBottom: '1rem', fontWeight: 'bold', maxWidth: '600px', textAlign: 'center' }}>
              Você arriscou chutar a palavra, errou a letra e perdeu instantaneamente!
            </p>
          )}

          {username === gameResult.winner && gameResult.reason === 'wo' && (
            <p style={{ color: '#10b981', fontSize: '1.5rem', marginBottom: '1rem', fontWeight: 'bold', maxWidth: '600px', textAlign: 'center' }}>
              O seu adversário sofreu uma queda de conexão prolongada. Vitória por W.O!
            </p>
          )}

          {username === gameResult.winner && gameResult.reason === 'surrender' && (
            <p style={{ color: '#10b981', fontSize: '1.5rem', marginBottom: '1rem', fontWeight: 'bold', maxWidth: '600px', textAlign: 'center' }}>
              Você ganhou a partida por desistência do adversário! (Bônus de 50 pontos)
            </p>
          )}

          <p style={{ fontSize: '1.5rem', marginBottom: '0.5rem', color: '#f8fafc' }}>A palavra era: <strong style={{ color: 'var(--accent-color)', fontSize: '2rem' }}>{gameResult.word}</strong></p>
          <p style={{ fontSize: '1.2rem', marginBottom: '2.5rem', color: 'var(--text-secondary)' }}>O vencedor foi: <strong>{gameResult.winner}</strong></p>

          <button
            onClick={() => {
              setView('lobby');
              setGameResult(null);
              setGameState(null);
              setIsSuddenDeathMode(false);
              fetchRanking();
            }}
            className="btn-modern"
            style={{ fontSize: '1.2rem', padding: '1rem 3rem', background: 'linear-gradient(135deg, #8b5cf6, #6366f1)' }}
          >
            Voltar ao Lobby
          </button>
        </div>
      )}

      <div className="screen-container fade-in" style={{ padding: '2rem 5%' }}>
        <div className="game-layout">

          {/* Panel Lateral */}
          <div className="panel-side">
            <div className="glass-panel" style={{ padding: '1.5rem' }}>
              <h2 className="title-glow" style={{ fontSize: '2rem', marginBottom: '1rem' }}>A Forca</h2>

              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1rem', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
                <span>Ping: {ping}ms</span>
                <span>Sala: {gameState?.roomId?.substring(0, 6)}...</span>
              </div>

              <div className="stat-box" style={{ marginBottom: '1rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                <span className="stat-label">Controle de Turno</span>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span className="stat-value" style={{ color: gameState?.turn === username ? 'var(--success)' : 'var(--danger)', fontSize: '1.2rem' }}>
                    {gameState?.turn === username ? 'Sua Vez' : `Vez de ${gameState?.turn}`}
                  </span>
                  <button
                    onClick={() => {
                      if (window.confirm("Deseja realmente abandonar a partida? Seu oponente será declarado vencedor e ganhará 50 pontos.")) {
                        socket.emit('abandon_match', { roomId: gameState.roomId, username: username.toUpperCase() });
                        setView('lobby');
                        // eslint-disable-next-line
                        fetchRanking().catch(console.error);
                      }
                    }}
                    className="btn-modern"
                    style={{ padding: '0.4rem 0.8rem', background: 'linear-gradient(135deg, #ef4444, #dc2626)', fontSize: '0.8rem', borderRadius: '6px' }}
                  >
                    Abandonar
                  </button>
                </div>
              </div>
              <div className="stat-box" style={{ marginBottom: '1rem' }}>
                <span className="stat-label">Tempo Restante</span>
                <span className="stat-value">{gameState?.timeLeft}s</span>
              </div>

              <div style={{ padding: '1rem', background: 'rgba(0,0,0,0.3)', borderRadius: '12px' }}>
                <h4 style={{ color: 'var(--text-secondary)', marginBottom: '0.8rem' }}>Placar Atual</h4>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                  <span style={{ fontWeight: gameState?.turn === gameState?.p1 ? 'bold' : 'normal' }}>
                    P1: {gameState?.p1}
                  </span>
                  <span>{gameState?.p1Score}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ fontWeight: gameState?.turn === gameState?.p2 ? 'bold' : 'normal' }}>
                    P2: {gameState?.p2}
                  </span>
                  <span>{gameState?.p2Score}</span>
                </div>
              </div>

              {opponentDisconnectMsg && (
                <div className="fade-in" style={{ marginTop: '1rem', padding: '1rem', background: 'rgba(239, 68, 68, 0.2)', borderRadius: '12px', border: '1px solid var(--danger)', textAlign: 'center' }}>
                  <strong>Atenção:</strong> O oponente perdeu a conexão.
                  <div style={{ fontSize: '2.5rem', fontWeight: 'bold', margin: '0.5rem 0', color: '#ef4444', textShadow: '0 0 10px rgba(239,68,68,0.5)' }}>
                    {gameState?.pausedTimeLeft}s
                  </div>
                  <div style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
                    Aguardando retorno para evitar W.O.
                  </div>
                </div>
              )}

              {opponentReconnectedMsg && (
                <div className="fade-in" style={{ marginTop: '1rem', padding: '1rem', background: 'rgba(16, 185, 129, 0.2)', borderRadius: '12px', border: '1px solid var(--success)' }}>
                  <strong>Ótimo:</strong> {opponentReconnectedMsg}
                </div>
              )}

            </div>

            <div className="glass-panel" style={{ padding: '1.5rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.8rem' }}>
                <h4 style={{ margin: 0 }}>Teclado</h4>
                {gameState?.turn === username && (
                  <button
                    onClick={toggleSuddenDeath}
                    className="btn-modern"
                    style={{
                      padding: '0.4rem 0.8rem',
                      fontSize: '0.8rem',
                      background: isSuddenDeathMode ? 'linear-gradient(135deg, #f59e0b, #d97706)' : 'var(--bg-secondary)',
                      border: isSuddenDeathMode ? '1px solid #fcd34d' : '1px solid var(--border-color)',
                      boxShadow: isSuddenDeathMode ? '0 0 10px rgba(245,158,11,0.5)' : 'none'
                    }}
                  >
                    {isSuddenDeathMode ? 'Arriscando a Palavra!' : 'Chutar Palavra'}
                  </button>
                )}
              </div>

              {isSuddenDeathMode && (
                <div style={{ marginBottom: '1rem', color: '#f59e0b', fontSize: '0.85rem', textAlign: 'center' }}>
                  <strong>Cuidado:</strong> Morte Súbita! Se errar, você perde na hora. Continue clicando nas letras corretas!
                </div>
              )}

              <div className="keyboard-grid">
                {'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').map(char => {
                  const isGuessed = gameState?.guesses?.includes(char);
                  return (
                    <button
                      key={char}
                      className="key-btn"
                      disabled={isGuessed || gameState?.turn !== username || gameState?.status !== 'playing'}
                      onClick={() => sendLetter(char)}
                    >
                      {char}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Engine Gráfica */}
          <div className="game-canvas-container">
            <PhaserGame gameState={gameState} username={username} gameResult={gameResult} socket={socket} />
          </div>

        </div>
      </div>
    </>
  );
}
