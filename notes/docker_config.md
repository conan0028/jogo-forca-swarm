Para verificar se o Docker e os seus containers estão operando corretamente, existem alguns comandos fundamentais que funcionam tanto no Ubuntu quanto no Fedora.

---

## 1. Verificar o Serviço (Systemd)

O primeiro passo é saber se o "motor" do Docker está ativo no sistema operacional.

```bash
sudo systemctl status docker
```

* Procure por uma linha verde escrito **active (running)**.
* Se estiver `inactive`, execute: `sudo systemctl start docker`.

---

## 2. Testar Permissões de Usuário

Para confirmar que o seu `logout` funcionou e que você consegue rodar comandos sem `sudo`:

```bash
docker version
```

Este comando deve listar as versões do **Client** e do **Server**. Se ele mostrar o Client mas der erro no Server, significa que o seu usuário ainda não tem permissão ou o serviço está parado.

---

## 3. Verificar Containers em Execução

Como o seu objetivo é usar o `docker compose up --build`, use estes comandos para monitorar a aplicação:

* **Para ver containers ativos:**
  
  ```bash
  docker ps
  ```

* **Para ver todos os containers (incluindo os que deram erro e pararam):**
  
  ```bash
  docker ps -a
  ```

* **Para ver os logs em tempo real (útil se algo não subir):**
  
  ```bash
  docker compose logs -f
  ```

---

## 4. O Teste Definitivo (Hello World)

Se quiser ter 100% de certeza antes de subir sua aplicação pesada, rode o teste oficial:

```bash
docker run hello-world
```

Se você vir a mensagem *"Hello from Docker!"*, a configuração está perfeita em ambas as máquinas.

---
