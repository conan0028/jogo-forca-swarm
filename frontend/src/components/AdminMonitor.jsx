import { useState, useEffect } from 'react';

/**
 * AdminMonitor Component
 * Visualiza em tempo real quais jogadores estão sendo processados por quais contêineres/nós no Docker Swarm.
 */
export default function AdminMonitor({ socket }) {
  const [allocations, setAllocations] = useState({}); // { username: serverID }

  useEffect(() => {
    if (!socket) return;

    // Intercepta o estado do jogo para extrair o serverID (telemetria do backend)
    const handleGameState = (state) => {
      const { p1, p2, serverID } = state;
      if (serverID) {
        setAllocations(prev => ({
          ...prev,
          ...(p1 && { [p1]: serverID }),
          ...(p2 && { [p2]: serverID })
        }));
      }
    };

    socket.on('game_state', handleGameState);
    
    // Força uma atualização se o socket já tiver um estado (opcional)
    return () => socket.off('game_state', handleGameState);
  }, [socket]);

  return (
    <div className="screen-container">
      <div className="glass-panel fade-in" style={{ width: '90%', maxWidth: '800px', backdropFilter: 'blur(20px)' }}>
        <h2 className="title-glow" style={{ textAlign: 'center', marginBottom: '1rem', fontSize: '2.5rem' }}>
          Monitor de Carga Distributed
        </h2>
        <p style={{ textAlign: 'center', color: 'var(--text-secondary)', marginBottom: '2rem' }}>
          Visualização em tempo real da alocação de containers por jogador no cluster Swarm.
        </p>

        <div style={{ overflowX: 'auto' }}>
          <table className="admin-table">
            <thead>
              <tr>
                <th>Jogador</th>
                <th>Nó / Contêiner Alocado</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(allocations).map(([user, server]) => (
                <tr key={user} className="fade-in">
                  <td style={{ fontWeight: 'bold', color: 'var(--text-primary)' }}>{user}</td>
                  <td>
                    <span style={{ 
                      fontFamily: 'monospace', 
                      background: 'rgba(16, 185, 129, 0.1)', 
                      padding: '0.4rem 0.8rem', 
                      borderRadius: '6px', 
                      color: 'var(--success)',
                      border: '1px solid rgba(16, 185, 129, 0.2)'
                    }}>
                      {server}
                    </span>
                  </td>
                  <td>
                    <span className="badge success">ATIVO</span>
                  </td>
                </tr>
              ))}
              {Object.keys(allocations).length === 0 && (
                <tr>
                  <td colSpan="3" style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-secondary)' }}>
                    Aguardando sincronização de pacotes dos Workers...
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div style={{ marginTop: '2rem', textAlign: 'center' }}>
          <button 
            className="btn-modern" 
            style={{ width: 'auto', padding: '0.8rem 2rem', background: 'rgba(255,255,255,0.05)', border: '1px solid var(--glass-border)' }}
            onClick={() => window.location.reload()}
          >
            Limpar Cache do Painel
          </button>
        </div>
      </div>
    </div>
  );
}
