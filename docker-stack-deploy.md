### Fase 0: Preparação da Rede Física (O Cabo)
Como os computadores serão ligados diretamente via cabo sem um roteador, é necessário definir IPs fixos para que eles se encontrem.

**Na máquina principal linux (Manager):**
1. Vá nas configurações de Rede Cabeada.
2. Defina o IPv4 como **Manual**.
3. Endereço IP: `192.168.10.1`
4. Máscara (Subnet): `255.255.255.0`

**Na máquina escrava Windows (Worker):**
1. Vá em Conexões de Rede > Ethernet > Propriedades > Protocolo IP Versão 4 (TCP/IPv4).
2. Endereço IP: `192.168.10.2`
3. Máscara: `255.255.255.0`
4. Abra o **PowerShell como Administrador** e rode este bloco para liberar o Swarm no firewall do Windows:
   ```powershell
   New-NetFirewallRule -DisplayName "Docker Swarm 2377" -Direction Inbound -Action Allow -Protocol TCP -LocalPort 2377
   New-NetFirewallRule -DisplayName "Docker Swarm 7946 TCP" -Direction Inbound -Action Allow -Protocol TCP -LocalPort 7946
   New-NetFirewallRule -DisplayName "Docker Swarm 7946 UDP" -Direction Inbound -Action Allow -Protocol UDP -LocalPort 7946
   New-NetFirewallRule -DisplayName "Docker Swarm 4789" -Direction Inbound -Action Allow -Protocol UDP -LocalPort 4789
   ```

---

### Fase 1: Fixando o Contexto e Gerando Imagens
Este passo deve ser feito nas **DUAS máquinas**. Ter as imagens compiladas localmente garante que o Swarm não tente baixar nada da internet. 
O Worker (máquina escrava) pode estar logado na conta dele do Docker, mas a tag (nome) da imagem deve ser a (Manager - Máquina principal).

**Em ambas as máquinas**
1. Transfira a pasta do projeto atualizada para a máquina 2.
2. Fixe o contexto do Docker para evitar contêineres fantasmas:
   ```bash
   docker context use default
   ```
3. Compile as imagens localmente com as tags idênticas:
   ```bash
   docker build -t camargoconan/forca-backend:latest ./backend
   docker build -t camargoconan/forca-frontend:latest ./frontend
   ```

---

### Fase 2: Subindo o Manager (Máquina Principal)
Agora que as fundações estão prontas, vamos criar o cluster.

**No seu Fedora:**
1. Limpe qualquer resquício de testes anteriores:
   ```bash
   docker swarm leave --force
   ```
2. Inicialize o Swarm amarrado ao IP do cabo de rede:
   ```bash
   docker swarm init --advertise-addr 192.168.10.1
   ```
3. *Guarde o comando `docker swarm join --token ...` que aparecerá na tela.*

---

### Fase 3: Conectando o Worker (Máquina Escrava)
Com o Manager rodando, é hora de conectar o Worker usando o comando gerado no passo anterior.
**No Windows:**
1. Limpe testes anteriores:
   ```bash
   docker swarm leave --force
   ```
2. Cole o comando gerado pelo Manager no passo anterior. Exemplo:
   ```bash
   docker swarm join --token SWMTKN-1-... 192.168.10.1:2377
   ```

---

### Fase 4: O Deploy (Hora da Verdade)
Com as duas máquinas conectadas e com as imagens já presentes nos discos locais, é hora de rodar a aplicação.

**No seu Fedora:**
1. Inicie a stack completa:
   ```bash
   docker stack deploy -c docker-stack.yml forca-stack
   ```

---

### Fase 5: Monitoramento e Apresentação (No Manager)
Estes são os comandos a serem usados durante a apresentação para mostrar ao professor que a arquitetura está funcionando.

1. **Mostrar os nós conectados:**
   ```bash
   docker node ls
   ```
   *(Mostrará o Fedora como Leader e o Windows como Ready).*

2. **Mostrar o balanceamento de carga (A prova real):**
   ```bash
   docker stack ps forca-stack
   ```
   *(Mostre ao professor que as réplicas do backend estão divididas entre as duas máquinas).*

3. **Acesso ao Jogo:**
   Peça aos alunos para abrirem o navegador nos computadores da faculdade (que devem estar na mesma rede) e acessarem:
   `http://192.168.10.1:5173`

4. **O Teste de Tolerância a Falhas (Clímax):**
    * Com o jogo rolando e os usuários acessando, **puxe o cabo de rede** (ou desconecte o Wi-Fi do notebook da máquina 2).
    * Rode novamente `docker stack ps forca-stack`.
    * Mostre que o Swarm detectou a queda do Worker e recriou instantaneamente as réplicas perdidas dentro do seu Fedora, mantendo o jogo online e o estado salvo no Redis!
---