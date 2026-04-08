import React, { useEffect, useRef } from 'react';
import Phaser from 'phaser';
import GameScene from './GameScene';

export default function PhaserGame({ gameState, username, gameResult, socket }) {
  const gameRef = useRef(null);
  const readySentRef = useRef(false);
  const sceneReadyRef = useRef(false);

  useEffect(() => {
    // NUCLEAR STABILITY: Garantia de que apenas UMA instância do jogo exista por aba.
    // Se houver uma remanescente (ex: Hot Reload ou falha de limpeza), destruímos agora.
    const forceGlobalCleanup = () => {
      if (window.__PHASER_GAME__) {
        console.warn('Detectada instância órfã do Phaser. Forçando limpeza nuclear...');
        try {
          window.__PHASER_GAME__.destroy(true);
          window.__PHASER_GAME__ = null;
        } catch (e) {
          console.error('Falha na limpeza nuclear:', e);
        }
      }
    };

    forceGlobalCleanup();

    const config = {
      type: Phaser.CANVAS,
      parent: 'phaser-container',
      width: '100%',
      height: '100%',
      backgroundColor: '#87CEEB',
      scene: [GameScene],
      audio: {
        disableWebAudio: false,
        noAudio: false
      },
      render: {
        pixelArt: false,
        antialias: true,
        powerPreference: 'low-power' // Prioriza economia de CPU/Energia
      },
      loader: {
        maxParallelDownloads: 1 // Serializa carregamento para evitar picos de I/O
      }
    };

    // STAGGERED INITIALIZATION: Pequeno delay para o navegador respirar e fazer GC
    // entre transições de cena (Lobby -> Game)
    const initTimer = setTimeout(() => {
      if (!gameRef.current) {
        const game = new Phaser.Game(config);
        gameRef.current = game;
        window.__PHASER_GAME__ = game;
        readySentRef.current = false;
        sceneReadyRef.current = false;

        // Listener de prontidão
        game.events.on('step', () => {
          if (!sceneReadyRef.current) {
            const scene = game.scene.getScene('GameScene');
            if (scene && scene.hintText) {
              sceneReadyRef.current = true;
            }
          }
        });
      }
    }, 150);

    const handleResize = () => {
      const container = document.getElementById('phaser-container');
      if (gameRef.current && gameRef.current.scale && container) {
        const w = container.clientWidth;
        const h = container.clientHeight;
        if (w > 0 && h > 0) gameRef.current.scale.resize(w, h);
      }
    };

    window.addEventListener('resize', handleResize);

    return () => {
      clearTimeout(initTimer);
      window.removeEventListener('resize', handleResize);
      
      if (gameRef.current) {
        console.log('Iniciando Sanitização Nuclear de Memória...');
        try {
          // 1. Para todos os sons imediatamente
          if (gameRef.current.sound) {
            gameRef.current.sound.stopAll();
            gameRef.current.sound.destroy();
          }
          // 2. Limpa cache de texturas (ajuda a evitar OOM)
          if (gameRef.current.textures) gameRef.current.textures.destroy();
          
          // 3. Destruição total
          gameRef.current.destroy(true);
          gameRef.current = null;
          window.__PHASER_GAME__ = null;
          console.log('Sanitização concluída. Memória liberada.');
        } catch (e) {
          console.warn('Erro durante sanitização (ignorado):', e);
        }
      }
    };
  }, []);

  // Emite player_ready quando o Phaser estiver pronto E tivermos o roomId
  useEffect(() => {
    if (!gameState?.roomId || readySentRef.current || !socket) return;

    const checkAndSend = () => {
      if (sceneReadyRef.current && !readySentRef.current) {
        readySentRef.current = true;
        socket.emit('player_ready', { roomId: gameState.roomId, username });
        return true;
      }
      return false;
    };

    // Tenta imediatamente
    if (checkAndSend()) return;

    // Se a cena ainda não está pronta, verifica a cada 100ms (por no máximo 10s)
    const interval = setInterval(() => {
      if (checkAndSend()) clearInterval(interval);
    }, 100);
    const timeout = setTimeout(() => {
      clearInterval(interval);
      // Fallback: envia mesmo que a cena não tenha carregado (safety net)
      if (!readySentRef.current) {
        readySentRef.current = true;
        socket.emit('player_ready', { roomId: gameState.roomId, username });
      }
    }, 10000);

    return () => {
      clearInterval(interval);
      clearTimeout(timeout);
    };
  }, [gameState?.roomId, socket, username]);

  useEffect(() => {
    // Comunicação React -> Phaser
    // Passamos o State do Node.js atualizado para a Scene desenhar
    if (gameRef.current && gameState) {
      const scene = gameRef.current.scene.getScene('GameScene');
      if (scene && scene.updateGameState) {
        scene.updateGameState(gameState, username);
      }
    }
  }, [gameState, username]);

  // Quando o evento game_over chegar, para todas as músicas e toca o jingle final
  useEffect(() => {
    if (gameResult && gameRef.current) {
      const scene = gameRef.current.scene.getScene('GameScene');
      if (scene && scene.stopAllMusicAndPlayEnd) {
        scene.stopAllMusicAndPlayEnd();
      }
    }
  }, [gameResult]);

  return (
    <div
      id="phaser-container"
      style={{ width: '100%', height: '100%', position: 'absolute', top: 0, left: 0 }}
    />
  );
}
