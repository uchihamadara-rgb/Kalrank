# KalRank — Guia de Agentes e Desenvolvimento

## Visão Geral

KalRank é um bot Discord que rastreia tempo em calls de voz e converte em XP/níveis. Roda com **Bun** e **discord.js v14**.

---

## Estrutura do Projeto

```
Kalrank-main/
├── index.js           # Entry point — bot + HTTP health check
├── package.json       # Dependências e scripts (Bun)
├── .env.example       # Template de variáveis de ambiente
├── .env               # Variáveis reais (não commitado)
└── agents.md          # Este arquivo
```

---

## Comandos Principais

| Comando | Descrição |
|---------|-----------|
| `bun install` | Instala dependências |
| `bun index.js` | Inicia o bot (produção) |
| `bun --watch index.js` | Inicia com hot-reload (dev) |
| `bun register-commands.js` | Registra comandos slash manualmente |

---

## Variáveis de Ambiente (`.env`)

```bash
# Obrigatórias
DISCORD_TOKEN=seu_token_do_bot
DISCORD_CLIENT_ID=seu_client_id

# Opcionais
PORT=10000                    # Porta HTTP health check
XP_PER_MINUTE=1               # XP ganho por minuto em call
XP_BASE=100                   # Base da fórmula de nível
LOG_LEVEL=info                # debug, info, warn, error
# DATABASE_URL=...            # Para persistência futura (PostgreSQL)
```

**Setup rápido:**

```bash
cp .env.example .env
# Edite .env com seus tokens
```

---

## Obter Credenciais Discord

1. Acesse [Discord Developer Portal](https://discord.com/developers/applications)
2. Crie uma **New Application** → Bot
3. Copie **Token** → `DISCORD_TOKEN`
4. Copie **Application ID** → `DISCORD_CLIENT_ID`
5. Em **Bot > Privileged Gateway Intents**, ative:
   - ✅ Server Members Intent
   - ✅ Presence Intent
   - ✅ Message Content Intent (opcional)
6. Em **OAuth2 > URL Generator**, selecione:
   - Scopes: `bot`, `applications.commands`
   - Permissions: `View Channels`, `Send Messages`, `Use Slash Commands`, `Connect`, `Speak`, `View Voice Channels`
7. Use a URL gerada para adicionar o bot ao servidor

---

## Comandos Slash Disponíveis

| Comando | Descrição |
|---------|-----------|
| `/rank` | Mostra nível, XP, barra de progresso e tempo em call |
| `/perfil` | Perfil completo com horas/minutos e timestamp |
| `/tempo` | Tempo total em call formatado (horas + minutos) |
| `/ranking` | Top 10 do servidor (filtrado por guild se usado em servidor) |

---

## Fórmula de Nível

```
Nível = floor(sqrt(XP / XP_BASE))
XP para nível N = N² × XP_BASE
```

Com `XP_BASE=100` (padrão):

- Nv.1: 100 XP
- Nv.2: 400 XP
- Nv.3: 900 XP
- Nv.10: 10.000 XP
- Nv.100: 1.000.000 XP

---

## Health Check HTTP

Endpoint: `GET http://localhost:10000/health`

Resposta:

```json
{
  "status": "ok",
  "bot": "connected",
  "uptime": "2h 30m",
  "players": 42,
  "memory": { "rss": "45 MB", "heapUsed": "28 MB" },
  "timestamp": "2025-01-17T20:15:00.000Z"
}
```

Útil para: Render, Railway, Fly.io, Docker health checks.

---

## Deploy

### Render (Web Service)

1. Conecte repo GitHub
2. Build: `bun install`
3. Start: `bun index.js`
4. Env vars: adicione `DISCORD_TOKEN`, `DISCORD_CLIENT_ID`, `PORT=10000`

### Railway

```bash
railway login
railway init
railway add --env DISCORD_TOKEN=... DISCORD_CLIENT_ID=...
railway up
```

### Docker

```dockerfile
FROM oven/bun:1-alpine
WORKDIR /app
COPY package.json bun.lock* ./
RUN bun install --production
COPY . .
EXPOSE 10000
CMD ["bun", "index.js"]
```

### VPS (systemd)

```ini
# /etc/systemd/system/kalrank.service
[Unit]
Description=KalRank Discord Bot
After=network.target

[Service]
Type=simple
User=ubuntu
WorkingDirectory=/opt/kalrank
ExecStart=/usr/local/bin/bun index.js
Restart=always
RestartSec=10
EnvironmentFile=/opt/kalrank/.env

[Install]
WantedBy=multi-user.target
```

---

## Extensões Futuras

### Persistência (PostgreSQL)

```javascript
// Adicionar em index.js ou módulo separado
import postgres from "postgres";
const sql = postgres(process.env.DATABASE_URL);

// Tabela: players (user_id PK, xp, total_voice_minutes, last_update)
// Carregar no getPlayer(), salvar no updatePlayerVoiceTime()
```

### Recursos Planejados

- [ ] Persistência em banco de dados
- [ ] Roles por nível (atribuir cargo ao subir nível)
- [ ] XP por mensagens (além de voice)
- [ ] Leaderboard global (cross-server)
- [ ] Comandos admin: `/setxp`, `/reset`, `/givexp`
- [ ] Web dashboard (React + API)
- [ ] Notificações de level up (DM ou canal)

---

## Debugging

```bash
# Logs detalhados
LOG_LEVEL=debug bun index.js

# Verificar comandos registrados
# No Discord: /rank (deve aparecer)

# Health check local
curl http://localhost:10000/health
```

---

## Problemas Comuns

| Sintoma | Causa | Solução |
|---------|-------|---------|
| "Application not found" | Client ID errado | Confira `DISCORD_CLIENT_ID` |
| "Invalid token" | Token errado/expirado | Regenere token no Dev Portal |
| Comandos não aparecem | Não registrados / cache | Aguarde 1h ou use guild-specific |
| Bot não vê voz | Intents desativados | Ative Guild Voice States no Dev Portal |
| Erro `guild.members.fetch()` | Sem Member Intent | Ative Server Members Intent |

---

## Contribuindo

1. Fork o repo
2. Crie branch: `git checkout -b feature/nova-funcionalidade`
3. Commit: `git commit -m "feat: adiciona X"`
4. Push: `git push origin feature/nova-funcionalidade`
5. Abra PR

### Padrões de Código

- ESM (`import`/`export`)
- TypeScript types via JSDoc (opcional)
- Logs via função `log(level, ...args)`
- Tratamento de erros em todos os handlers
- Graceful shutdown (SIGTERM/SIGINT)

---

## Licença

MIT — Use livremente.
