# Jogo da Forca: Multiplayer Distribuído em Cluster

![Status](https://img.shields.io/badge/Status-Produ%C3%A7%C3%A3o-brightgreen)
![Docker Swarm](https://img.shields.io/badge/Docker%20Swarm-Suportado-blue)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-Persist%C3%AAncia-informational)
![Redis](https://img.shields.io/badge/Redis-Single_Source_of_Truth-red)

Este repositório documenta a evolução arquitetural de uma clássica aplicação do Jogo da Forca para um subjacente **Sistema Distribuído robusto**. O projeto foi completamente redesenhado para operar em um cluster **Docker Swarm**, englobando as premissas de alta disponibilidade, tolerância a falhas e distribuição transparente de requisições sobre múltiplos nós, afastando-se das arquiteturas monolíticas locais.

## Atualização da Stack de Tecnologias

A infraestrutura foi modernizada e escalonada para o nível de produção, introduzindo eixos fundamentais que sustentam a tolerância do projeto:

- **Frontend Gráfico e Lógico:** Construção via React (JSX com elementos de Glassmorphism UI) e Phaser 3 (Engine para o Canvas nativo da Forca), ambos provisionados via Vite.
- **Backend Emissor:** Multi-instâncias de Node.js via Express, lidando com comunicações bidirecionais contínuas por intermédio de Socket.io.
- **Banco de Dados Relacional:** Substituição oficial do SQLite pelo **PostgreSQL**. O salto para este SGBD garante persistência de confiabilidade ACID, viabilizando leituras e gravações concorrentes pesadas, essenciais para registrar métricas massivas de perfis e placares estáticos de longa data.
- **Single Source of Truth (SSOT):** O **Redis** foi alçado como elemento-chave in-memory. Além de seu papel originário de matchmaking, ele hoje lidera o consenso do cluster retendo absolutamente todo o *estado efêmero do sistema*. Isso viabiliza o Roteamento em Tempo Real autêntico entre os nós distribuídos e guarda a integridade total do andamento fluído das sessões de jogo voláteis no Swarm.
- **Infraestrutura Orquestrada:** Implementação mandatória do **Docker Swarm**. Através de instâncias operando em *Manager nodes* e *Worker nodes*, aproveitamos o mecanismo nativo de sua malha de *Ingress Routing Mesh* para viabilizar um balanceamento de carga fluido, direcionando eficientemente o tráfego que entra em portas de rede fixas pelo Cluster em direção à gama flexível de réplicas responsivas em containers Node.js de base orgânica.

---

## Resiliência e Chaos Engineering

Para demonstrar proficiência empírica frente às temidas *falácias das redes distribuídas*, este projeto ostenta uma camada inteira de tolerância arquitetural baseada nos preceitos agressivos de caos, auto-curando e garantindo que os usuários atinjam a conclusão transparente de seus jogos mesmo diante de panes estruturais severas.

- **Reconexão Transparente (State Hydration):** O sistema agora abole perdas completas do trajeto de pareamento devido ao choque do ambiente produtivo. Caso um contêiner no backend capote acidentalmente ou que ocorra um esvaziamento premeditado na nuvem (*Node Drain* / *Crash*), o cliente que for desconectado identifica a adversidade, efetua e conclui uma reconexão transicional e, num redirecionamento imediato para outro *Worker node* sadio pelo Ingress, prossegue com sua sessão valendo-se do resgate silencioso de contexto do `sessionStorage`. A experiência do jogador mantém-se ininterrupta sem requerer da pessoa uma chata ação de re-login ou reinício do fluxo do pareamento original.
- **Garbage Collection Autônomo:** Nós cortamos a dependência teórica de sistemas e encerramentos "limpos". Com a implementação robusta de um ecossistema autônomo baseado no disparo persistente de batimentos de sistema (**Heartbeat de 2s**) cliente-servidor nativo, geramos varreduras cruciais que limpam severamente os contatos falhos, expurgando em tempo hábil as conexões estilhaçadas dos jogadores e WebSockets mortos ("*zombie states*"). Isso purifica o ambiente logo num momento em que um contêiner de partida acaba de receber e exalar um `SIGKILL` terminal abrupto.
- **Painel de Telemetria:** Ferramenta dedicada para os operadores do Cluster que viabiliza acompanhamento integral do estresse imposto ao sistema. Acessível através da rota de auditoria `/monitor`, esta placa controladora exibe observabilidade refinada do tráfego das redes num fluxo vital contínuo, espelhando e dissecando para análise gráfica os valores reais em tempo de execução como a distribuição de carga simétrica dos nós hospedados na nuvem (*players reportando as hashes dos conteineres*) com um *ping* explícito na oscilação milissegundo as latências cruciais enfrentadas individualmente pelo público ativo.

---

## Novo Roteiro de Execução e Deploy Integrado

A arquitetura avançada de Sistemas Distribuídos e as validações subjacentes requerem inicializadores mais precisos. O uso local simples de instâncias puras via `docker compose up` foi banido. Observe a cadeia correta para orquestração da sua base em Nuvem ou Computador Host operante da engrenagem.

**1. Transforme seu Docker nativo Engine num potente Líder / Gerente Escalonado (Manager Node de Iniciação do Cluster Swarm):**
```bash
docker swarm init
```
*(Atenção: Se este procedimento apresentar rejeição denunciando múltiplos IPs disponíveis para a rota inicial, contorne esse impasse do terminal copiando e colando a tag sugestionada adjunta `docker swarm init --advertise-addr <O-SEU-IP-INDICADO>`)*

**2. Procedimento Essencial para Build Totalmente Limpo sem Poluentes de Memória Cache (Garante o embarque ideal estático nos Contêineres de Inclusão da Stack sem fantasmas legados):**
```bash
docker compose build --no-cache
```

**3. Faça a Inserção Estrutural Distribuída de Todo o Sistema como uma Stack Nativa Permanente Lida Pelo Yaml Master (Ato de Deploy Oficial):**
```bash
docker stack deploy -c docker-compose.yml forca_cluster --resolve-image always
```

Uma vez estabilizado com um *"Running"* por todos os containeres do Swarm nas consultas da stack, as barreiras locais despencaram!

### Acessando a Aplicação Orquestrada Livre

Se o deploy fluir perfeitamente e o cluster inicializar as bases dos Worker Nodes devidamente, o acesso ocorrerá naturalmente no navegador aberto local:

* Acesso Padrão -> [http://localhost:5173](http://localhost:5173)

**Dica de Validação Adicional do Ingress Subjacente do Swarm:** É altamente salutar simular o peso real distribuído e a ação transparente da malha protetora. Abra consecutivamente mais de 3 páginas de um de seus navegadores em Abas Anônimas acessando o projeto; se em seguida você adentrar em `/monitor`, flagrá-la-se-ão perfeitamente todos os seus "usuários" fantasmas atrelados a hashes distribuídas e separadas nos containers *Manager/Worker* aleatórios designados a receber a sobrecarga dos seus perfis dinamicamente!

---