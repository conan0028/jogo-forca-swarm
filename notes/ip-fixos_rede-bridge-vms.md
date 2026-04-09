### Esse cheasheet foi feito configuração de virtualização linux e abertura de portas para uso do Docker Swarm

`sudo modprobe kvm_amd` # iniciar o serviço depois de habilitar na BIOS do PC

Para resolver isso de forma "bruta" e definitiva (sem depender de arquivos de configuração que o sistema possa estar ignorando), vamos usar um **Script de Systemd**. Isso força o sistema a rodar o comando logo após o boot.

Aqui está o procedimento e a nota atualizada:

### 1. Criar o serviço de carregamento forçado

Execute estes comandos no seu Zsh:

```zsh
# 1. Cria o arquivo de serviço
sudo nano /etc/systemd/system/load-kvm.service
```

**Cole o conteúdo abaixo no arquivo:**

```ini
[Unit]
Description=Forçar carregamento do módulo KVM AMD
After=network.target

[Service]
Type=oneshot
ExecStart=/usr/sbin/modprobe kvm_amd
RemainAfterExit=yes

[Install]
WantedBy=multi-user.target
```

**Ative o serviço:**

```zsh
# 2. Recarrega o systemd, habilita e inicia o serviço
sudo systemctl daemon-reload
sudo systemctl enable --now load-kvm.service
```

---

## Nota para o Obsidian (Versão Definitiva)

# Configuração de Redes em Bridge e Autocarga do KVM no Fedora

Este guia resolve o problema do KVM não carregar no boot e configura a rede Bridge para as VMs.

## 1. Carregamento Automático do KVM (Solução Systemd)

Se os arquivos em `/etc/modules-load.d/` falharem, use este método para forçar o comando no boot.

```zsh
# Criar serviço para rodar o modprobe automaticamente
sudo bash -c 'cat <<EOF > /etc/systemd/system/load-kvm.service
[Unit]
Description=Forçar carregamento do módulo KVM AMD
After=network.target

[Service]
Type=oneshot
ExecStart=/usr/sbin/modprobe kvm_amd
RemainAfterExit=yes

[Install]
WantedBy=multi-user.target
EOF'

# Ativar o serviço
sudo systemctl daemon-reload
sudo systemctl enable --now load-kvm.service
```

---

## 2. Configuração da Rede Bridge (Host Fedora)

Configuração para a placa física `enp3s0f3u4` compartilhar a rede local com as VMs.

```zsh
# Criar a bridge e associar a placa física
sudo nmcli connection add type bridge autoconnect yes con-name br0 ifname br0
sudo nmcli connection add type bridge-slave autoconnect yes con-name br0-slave ifname enp3s0f3u4 master br0

# Resetar conexões para ativar a ponte
sudo nmcli connection down "Wired connection 2"
sudo nmcli connection up br0
sudo nmcli connection up br0-slave

# Definir IP Estático no Host
sudo nmcli connection modify br0 ipv4.addresses 192.168.3.102/24 ipv4.gateway 192.168.3.1 ipv4.dns "1.1.1.1,8.8.8.8" ipv4.method manual
sudo nmcli connection up br0
```

---

## 3. Configuração no Virtual Machine Manager (VMM)

Para cada VM criada, altere a interface de rede:

- **Network Source:** Bridge device...
- **Device name:** `br0`
- **Device model:** `virtio`

---

## 4. Configuração de IP Fixo na VM (Ex: Ubuntu Server)

Dados para inserir durante a instalação:

- **Subnet:** `192.168.3.0/24`
- **Address:** `192.168.3.110` (VM 1) ou `192.168.3.111` (VM 2)
- **Gateway:** `192.168.3.1`
- **Name servers:** `1.1.1.1, 8.8.8.8`

---

## 5. Correção de Firewall (Docker/Iptables)

Caso as VMs fiquem isoladas, rode no Host:

```zsh
sudo iptables -I FORWARD -m physdev --physdev-is-bridged -j ACCEPT
sudo sysctl net.bridge.bridge-nf-call-iptables=0
```

---

Com esse serviço do **Systemd**, o Fedora será obrigado a rodar o `modprobe`

---
