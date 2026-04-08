import Phaser from 'phaser';

export default class GameScene extends Phaser.Scene {
  constructor() {
    super('GameScene');
    this.gameState = null;
    this.username = null;
    this.currentErrors = -1;
  }

  preload() {
    // Cenário (Nuvem dinâmica no fundo)
    this.load.image('nuvem', '/img/nuvem.png');

    // Grama para cobrir o chão
    this.load.image('grama', '/img/grama.png');

    // Quadros do cenário montado (Grama + Forca + Boneco pré-posicionado pelo Designer)
    this.load.image('stage_0', '/img/cenario-montado.png'); // Sem corpo
    
    // A numeração do asset do designer estava exportada inversamente 
    // (cenario 1 = cheio de erros/6 peças e cenario 6 = boneco vazio/1 erro).
    // Invertemos dinamicamente o mapeamento de Array para consertar.
    this.load.image('stage_1', '/img/cenario-montado-6.png');
    this.load.image('stage_2', '/img/cenario-montado-5.png');
    this.load.image('stage_3', '/img/cenario-montado-4.png');
    this.load.image('stage_4', '/img/cenario-montado-3.png');
    this.load.image('stage_5', '/img/cenario-montado-2.png');
    this.load.image('stage_6', '/img/cenario-montado-1.png');

    // ---- ÁUDIO: Trilhas sonoras dinâmicas ----
    this.load.audio('musica_normal', '/audio/musica_normal.mp3');
    this.load.audio('musica_tensao', '/audio/musica_tensao.mp3');
    this.load.audio('musica_perigo', '/audio/musica_perigo.mp3');
    this.load.audio('end_game', '/audio/end_game.mp3');
  }

  create() {
    this.cameras.main.setBackgroundColor('#87CEEB'); // Céu azulzinho
    
    const { width, height } = this.scale;

    // Grupo para focar ancoragem dinamicamente a partir do centro inferior e não desalinhar
    this.scenarioGroup = this.add.container(width / 2, height);
    
    // ---- NUVENS ATMOSFÉRICAS (atrás de tudo no container) ----
    // Configurações das nuvens: posições, escalas e velocidades variadas para efeito de parallax
    this.clouds = [];
    const cloudConfigs = [
      { x: -600, y: -560, scale: 0.55, alpha: 0.35, speed: 0.3 },
      { x: 450, y: -630, scale: 0.75, alpha: 0.7, speed: 0.5 },
      { x: -80, y: -430, scale: 0.5, alpha: 0.5, speed: 0.2 },
      { x: 80, y: -500, scale: 0.5, alpha: 0.5, speed: 0.25 },
      { x: 550, y: -470, scale: 0.6, alpha: 0.9, speed: 0.7 },
    ];

    cloudConfigs.forEach((cfg) => {
      const cloud = this.add.image(cfg.x, cfg.y, 'nuvem')
        .setOrigin(0.5, 0.5)
        .setScale(cfg.scale)
        .setAlpha(cfg.alpha);
        
      cloud.speed = cfg.speed; // Variável personalizada para o update()
      
      this.scenarioGroup.add(cloud);
      this.clouds.push(cloud);
    });

    // ---- CHÃO VERDE SÓLIDO (Background Fundo do Chão) ----
    // Adicionado ANTES dos stages para ficar no fundo, cobrindo buracos azuis
    const groundFill = this.add.graphics();
    groundFill.fillStyle(0x3a7d2c, 1); // Verde escuro natural
    groundFill.fillRect(-2000, -80, 4000, 400); // Começa mais alto (-80) e desce cobrindo tudo
    this.scenarioGroup.add(groundFill);

    // Em vez de montar grama + forca + corpo soltos (causando desalinhamento e escalas distorcidas),
    // empilhamos as lâminas renderizadas integralmente do cenário.
    this.stages = [];
    for (let i = 0; i <= 6; i++) {
        let frame = this.add.image(0, 0, `stage_${i}`).setOrigin(0.5, 1);
        
        // Só o stage_0 (Grama e Forca limpas) começa 100% visível
        frame.setAlpha(i === 0 ? 1 : 0);
        
        // Removemos o constraint de scale (0.85) daqui porque a engine já gerencia no Resize!

        this.scenarioGroup.add(frame);
        this.stages.push(frame);
    }

    // ---- GRAMA COBRINDO O CHÃO TODO ----
    // Posiciona tiles de grama ao longo de todo o chão para cobrir a largura inteira.
    this.grassTiles = [];
    const grassTexture = this.textures.get('grama');
    const grassWidth = grassTexture.getSourceImage().width;
    const tileCount = 14; 
    const startX = -(tileCount / 2) * grassWidth;

    for (let i = 0; i < tileCount; i++) {
      const grass = this.add.image(startX + (i * grassWidth), 30, 'grama')
        .setOrigin(0, 1);
      this.scenarioGroup.add(grass);
      this.grassTiles.push(grass);
    }

    // Textos Estáticos (Removido Glow pra bordas visiveis e fortes sobre o azul)
    const textStyle = { fontFamily: 'Outfit, sans-serif', color: '#1e293b' };

    this.hintText = this.add.text(width / 2, 50, 'DICA:', { ...textStyle, fontSize: '28px', fontStyle: 'bold' }).setOrigin(0.5);
    
    // UI: Painel de Vidro (Backdrop) que resolve o bug do "quadrado preto" em CANVAS
    this.wordBg = this.add.graphics();
    
    // Texto da Palavra (Otimizado para Canvas)
    this.wordText = this.add.text(width - 50, height - 120, '_ _ _ _', { 
        ...textStyle, 
        fontSize: '48px', 
        color: '#ffffff', 
        stroke: '#0f172a', 
        strokeThickness: 3,  
        fontStyle: '900'
    }).setOrigin(1, 0.5).setPadding(15).setAlign('right');
    
    this.errorsText = this.add.text(40, height - 120, 'Erros: 0/6', { ...textStyle, fontSize: '24px', color: '#ef4444', stroke: '#fff', strokeThickness: 3 });
    this.turnText = this.add.text(40, height - 160, 'Aguardando...', { ...textStyle, fontSize: '22px', stroke: '#fff', strokeThickness: 4 }).setOrigin(0, 0.5);

    this.scale.on('resize', this.resize, this);
    this.resize(this.scale); // Setup inicial

    // ---- ÁUDIO: Inicializa as trilhas em loop (sem tocar ainda) ----
    this.musicNormal = this.sound.add('musica_normal', { loop: true, volume: 0.4 });
    this.musicTensao = this.sound.add('musica_tensao', { loop: true, volume: 0.4 });
    this.musicPerigo = this.sound.add('musica_perigo', { loop: true, volume: 0.4 });
    this.soundEndGame = this.sound.add('end_game', { loop: false, volume: 0.7 });
    this.currentTrack = null; // Controla qual faixa está tocando agora
  }

  // Chamado pelo React quando o evento game_over chegar
  stopAllMusicAndPlayEnd() {
    // Para qualquer trilha em loop que ainda esteja tocando
    [this.musicNormal, this.musicTensao, this.musicPerigo].forEach(track => {
      if (track && track.isPlaying) track.stop();
    });
    this.currentTrack = null;

    // Toca o jingle de fim de jogo uma única vez
    if (this.soundEndGame && !this.soundEndGame.isPlaying) {
      this.soundEndGame.play();
    }
  }

  resize(gameSize) {
    const { width, height } = gameSize;
    if (this.hintText) this.hintText.setPosition(width / 2, 50);
    if (this.wordText) this.wordText.setPosition(width - 50, height - 120);
    if (this.turnText) this.turnText.setPosition(40, height - 160);
    if (this.errorsText) this.errorsText.setPosition(40, height - 120);
    
    // Redesenha o painel de fundo da palavra no resize
    this.updateWordBackground();
    
    if (this.scenarioGroup) {
      this.scenarioGroup.setPosition(width / 2, height);
      // Fator de escala dinâmico generoso para preencher a tela
      const scaleFactor = height < 800 ? 0.8 : 1.25;
      this.scenarioGroup.setScale(scaleFactor);
    }
  }

  // Troca a faixa de áudio ativa, parando a anterior suavemente
  switchTrack(newTrack) {
    if (this.currentTrack === newTrack) return; // Já está tocando essa

    // Para a faixa anterior (se existir)
    if (this.currentTrack && this.currentTrack.isPlaying) {
      this.currentTrack.stop();
    }

    // Inicia a nova faixa
    newTrack.play();
    this.currentTrack = newTrack;
  }

  drawHangman(errors) {
    const safeErrors = Math.min(6, Math.max(0, errors));
    
    // Altera a cor do céu baseada nos erros (aumenta a tensão)
    if (safeErrors >= 5) {
        const color = '#ffcccb';
        this.cameras.main.setBackgroundColor(color); // Vermelho claro
        this.switchTrack(this.musicPerigo);
    } else if (safeErrors === 4) {
        const color = '#fff5ba';
        this.cameras.main.setBackgroundColor(color); // Amarelo claro
        this.switchTrack(this.musicTensao);
    } else {
        const color = '#87CEEB';
        this.cameras.main.setBackgroundColor(color); // Céu azulzinho normal
        this.switchTrack(this.musicNormal);
    }

    // Varremos todos os frames para certificar que o frame correto é o MAIS alto em Alpha
    for (let i = 0; i <= 6; i++) {
        const frame = this.stages[i];
        
        // Se estamos no estágio exato dos erros, revelamos ele como um Fade!
        if (i === safeErrors) {
            if (frame.alpha === 0 && !frame.fadeTriggered) {
                frame.fadeTriggered = true;
                this.tweens.add({
                    targets: frame,
                    alpha: 1,
                    duration: 400,
                    ease: 'Power2'
                });
            }
        } 
        // Estágios perfeitamente idênticos do passado (grama + base) mantemos vivos atrás pra não sumir o chão no tween do novo!
        else if (i < safeErrors) {
            frame.setAlpha(1);
        }
        else {
            if (i > 0) frame.setAlpha(0); // Garante reset
            frame.fadeTriggered = false;
        }
    }
  }

  // Hook exposto pro React
  updateGameState(state, currentPlayer) {
    this.gameState = state;
    this.username = currentPlayer;
    
    // Atualiza a UI apenas quando o estado chega (1x por segundo), evitando gargalo de 60 FPS
    this.updateUI();
  }

  updateUI() {
    if (!this.gameState || !this.hintText) return;

    this.hintText.setText(`DICA: ${this.gameState.hint.toUpperCase()}`);
    
    // Insere espaço entre as letras, mas garantindo compatibilidade com traços '_'
    const spacedMask = this.gameState.maskedWord.split('').join(' ');
    
    // Otimização: Só atualiza o texto se ele realmente mudou (evita redesenhar canvas em modo CANVAS toda vez)
    if (this.currentMask !== spacedMask) {
      if (this.wordText) {
        this.wordText.setText(spacedMask);
        this.updateWordBackground();
      }
      this.currentMask = spacedMask;
    }
    
    this.errorsText.setText(`Erros: ${this.gameState.errors}/6`);

    if (this.gameState.turn === this.username) {
      const msg = 'SUA VEZ! ESCOLHA UMA LETRA';
      if (this.turnText.text !== msg) {
        this.turnText.setText(msg);
        this.turnText.setColor('#10b981'); 
      }
    } else {
      const msg = `AGUARDE... VEZ DE: ${this.gameState.turn}`;
      if (this.turnText.text !== msg) {
        this.turnText.setText(msg);
        this.turnText.setColor('#ef4444'); 
      }
    }
    
    // Checagem segura pra só desenhar ou acionar animação quando algo fisicamente sobe os erros
    if (this.currentErrors !== this.gameState.errors) {
      this.currentErrors = this.gameState.errors;
      this.drawHangman(this.currentErrors);
    }
  }

  updateWordBackground() {
    if (!this.wordBg || !this.wordText || !this.wordText.text) return;

    // Otimização: Só limpa e redesenha se as dimensões mudarem drasticamente
    // ou se for a primeira vez. Para este jogo, redesenhar 1x por segundo (cada letra)
    // é seguro, mas limpamos o cache anterior.
    this.wordBg.clear();
    
    // Estilo Glass: Azul escuro semitransparente com borda sutil
    this.wordBg.fillStyle(0x0f172a, 0.4);
    this.wordBg.lineStyle(2, 0xffffff, 0.1);
    
    const width = this.wordText.width + 40;
    const height = this.wordText.height + 20;
    const x = this.wordText.x - width + 10;
    const y = this.wordText.y - height / 2;

    this.wordBg.fillRoundedRect(x, y, width, height, 16);
    this.wordBg.strokeRoundedRect(x, y, width, height, 16);
  }

  update() {
    // A logica fixa de UI foi movida para updateUI(). Deixamos apenas o que precisa rodar a 60 FPS:

    // ---- Loop Atmosférico: Sistema Realista de Nuvens ----
    if (this.clouds && this.clouds.length > 0) {
      // Monitor ultra-wide tem larguras bem extensas, 1000 pro scenario centrado é margem segura
      const END_RIGHT_X = 1200; 
      const RESTART_LEFT_X = -1200;

      this.clouds.forEach(cloud => {
        cloud.x += cloud.speed;
        
        // Se a nuvem sumir na direita, reinicia na extrema esquerda
        if (cloud.x > END_RIGHT_X) {
          cloud.x = RESTART_LEFT_X;
          
          // Efeito orgânico: quando ressurge, move a nuvem levemente em Y (cima ou baixo)
          // Mas garante que não desça pra frente da face da forca
          cloud.y = Phaser.Math.Between(-650, -420); 
        }
      });
    }
  }
}
