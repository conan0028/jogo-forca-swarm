### O Roteiro de "Religação" (Leva 2 minutos)

Você não precisará mexer em **nenhuma linha de código**, nem no React, nem no Node.js. Você só precisará refazer o "aperto de mão" do Swarm. 

Guarde este passo a passo para amanhã:

**1. Descubra os novos IPs:**
Assim que conectar na rede da faculdade, abra o terminal no Fedora e no Ubuntu e rode o bom e velho:

```bash
ip a
```

Anote o novo IP do Fedora e o novo IP da VM Ubuntu.

**2. Desmonte o cluster antigo (Nas duas máquinas):**
Como os IPs mudaram, o Swarm antigo virou lixo. Rode este comando **no Fedora e no Ubuntu** para forçar as máquinas a esquecerem o cluster da sua casa:

```bash
docker swarm leave --force
```

**3. Crie o novo cluster (No Fedora):**
Inicie o Swarm novamente, agora apontando para o IP que a faculdade te deu:

```bash
docker swarm init --advertise-addr <NOVO_IP_DO_FEDORA_NA_FACULDADE>
```

Ele vai cuspir aquele comando com o token de *join*.

**4. Reconecte o Worker (No Ubuntu):**
Copie o comando que o Fedora gerou e cole no terminal da sua VM Ubuntu:

```bash
docker swarm join --token <TOKEN> <NOVO_IP_DO_FEDORA>:2377
```

**5. Suba a aplicação:**
Volte para o Fedora, vá para a pasta do seu projeto e rode o seu comando de sempre:

```bash
docker stack deploy -c docker-compose.yml forca_cluster --resolve-image always
```

### Dica de Engenheiro (Para o Futuro)

Se você fosse apresentar isso em vários lugares diferentes e não quisesse ter o trabalho de refazer o Swarm toda vez, a solução profissional seria instalar um serviço de rede Mesh (como o **Tailscale** ou o **ZeroTier**). Eles instalam uma placa de rede virtual nas suas máquinas que dá a elas um IP fixo global (ex: `100.x.x.x`). Assim, não importa se você está em casa, na faculdade ou na China, o IP do Swarm nunca muda.

Mas, para amanhã, o roteiro do `leave --force` e `init` resolve seu problema perfeitamente em 2 minutos.

---
