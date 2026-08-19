/**
 * KalRank - Discord Bot para Ranking por Tempo em Call
 *
 * Funcionalidades:
 * - Rastreia tempo em call de voz
 * - Sistema de XP e níveis baseado em tempo
 * - Comandos slash: rank, ranking, perfil, tempo
 * - Persistência em memória (pode ser estendido para DB)
 * - Health check HTTP para deploy (Render, Railway, etc.)
 *
 * Execução: bun index.js
 */

import "dotenv/config";

import { Client, GatewayIntentBits, Events, REST, Routes } from "discord.js";

import { createServer } from "http";

// ============ CONFIGURAÇÕES ============
const CONFIG = {
  port: parseInt(process.env.PORT || "10000", 10),
  token: process.env.DISCORD_TOKEN,
  clientId: process.env.DISCORD_CLIENT_ID,
  xpPerMinute: parseInt(process.env.XP_PER_MINUTE || "1", 10),
  xpBase: parseInt(process.env.XP_BASE || "100", 10),
  logLevel: process.env.LOG_LEVEL || "info",
};

// Validações iniciais
if (!CONFIG.token) {
  console.error("❌ ERRO: DISCORD_TOKEN não definido no .env");
  process.exit(1);
}

if (!CONFIG.clientId) {
  console.warn(
    "⚠️ AVISO: DISCORD_CLIENT_ID não definido. Comandos slash não serão registrados globalmente.",
  );
}

// ============ LOGGER SIMPLES ============
const logLevels = { debug: 0, info: 1, warn: 2, error: 3 };
const currentLogLevel = logLevels[CONFIG.logLevel] ?? 1;

function log(level, ...args) {
  if (logLevels[level] >= currentLogLevel) {
    const prefix = level.toUpperCase().padEnd(5);
    console.log(`[${new Date().toISOString()}] ${prefix}`, ...args);
  }
}

// ============ CÁLCULOS DE XP/NÍVEL ============
function getLevel(xp) {
  return Math.floor(Math.sqrt(xp / CONFIG.xpBase));
}

function getNextLevelXP(level) {
  return (level + 1) ** 2 * CONFIG.xpBase;
}

function getXPForLevel(level) {
  return level ** 2 * CONFIG.xpBase;
}

// ============ ARMAZENAMENTO (Em Memória) ============
// Estrutura: Map<userId, { xp, voiceJoinTime, totalVoiceMinutes, lastUpdate }>
const players = new Map();

function getPlayer(userId) {
  if (!players.has(userId)) {
    players.set(userId, {
      xp: 0,
      voiceJoinTime: null,
      totalVoiceMinutes: 0,
      lastUpdate: Date.now(),
    });
  }
  return players.get(userId);
}

function updatePlayerVoiceTime(userId, minutes) {
  const player = getPlayer(userId);
  player.totalVoiceMinutes += minutes;
  player.xp += minutes * CONFIG.xpPerMinute;
  player.lastUpdate = Date.now();
  return player;
}

// ============ COMANDOS SLASH ============
const COMMANDS = [
  {
    name: "rank",
    description: "Mostra seu nível e XP atual",
  },
  {
    name: "ranking",
    description: "Mostra o top 10 do servidor",
  },
  {
    name: "perfil",
    description: "Mostra seu perfil completo no KalRank",
  },
  {
    name: "tempo",
    description: "Mostra seu tempo total em call",
  },
];

// ============ CLIENT DISCORD ============
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildPresences,
    GatewayIntentBits.GuildVoiceStates,
  ],
});

// ============ EVENTOS ============
client.once(Events.ClientReady, async (readyClient) => {
  log("info", `✅ KalRank conectado como ${readyClient.user.tag}`);
  log("info", `📊 Servidores: ${readyClient.guilds.cache.size}`);

  // Registrar comandos slash
  if (CONFIG.clientId) {
    try {
      const rest = new REST({ version: "10" }).setToken(CONFIG.token);

      // Registrar globalmente (demora até 1h para propagar)
      // Para desenvolvimento, use guild-specific: Routes.applicationGuildCommands(clientId, guildId)
      await rest.put(Routes.applicationCommands(CONFIG.clientId), {
        body: COMMANDS,
      });

      log("info", "✅ Comandos slash registrados globalmente");
    } catch (error) {
      log("error", "❌ Erro ao registrar comandos:", error);
   // Registrar comandos slash nos servidores
  try {
    const rest = new REST({ version: "10" }).setToken(CONFIG.token);

    for (const [guildId] of readyClient.guilds.cache) {
      await rest.put(
        Routes.applicationGuildCommands(readyClient.user.id, guildId),
        {
          body: COMMANDS,
        },
      );

      log("info", `✅ Comandos registrados no servidor ${guildId}`);
    }

    log(
      "info",
      `✅ Comandos slash registrados em ${readyClient.guilds.cache.size} servidor(es)`,
    );
  } catch (error) {
    log("error", "❌ Erro ao registrar comandos:", error);
  }

client.on(Events.VoiceStateUpdate, (oldState, newState) => {
  const userId = newState.id;

  // Ignorar bots
  if (newState.member?.user.bot) return;

  const player = getPlayer(userId);
  const now = Date.now();

  // Entrou em call
  if (!oldState.channelId && newState.channelId) {
    player.voiceJoinTime = now;
    log("debug", `🎙️ ${newState.member?.user.tag || userId} entrou na call`);
    return;
  }

  // Saiu da call
  if (oldState.channelId && !newState.channelId) {
    if (player.voiceJoinTime) {
      const minutes = Math.floor((now - player.voiceJoinTime) / 60000);

      if (minutes > 0) {
        updatePlayerVoiceTime(userId, minutes);
        log(
          "info",
          `⭐ ${newState.member?.user.tag || userId} ganhou ${minutes} XP (${minutes} min)`,
        );
      }

      player.voiceJoinTime = null;
    }
    return;
  }

  // Moveu de canal (resetar timer para evitar exploit)
  if (
    oldState.channelId &&
    newState.channelId &&
    oldState.channelId !== newState.channelId
  ) {
    if (player.voiceJoinTime) {
      const minutes = Math.floor((now - player.voiceJoinTime) / 60000);
      if (minutes > 0) {
        updatePlayerVoiceTime(userId, minutes);
      }
    }
    player.voiceJoinTime = now;
  }
});

client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  const { commandName, user, guildId } = interaction;
  const player = getPlayer(user.id);
  const level = getLevel(player.xp);
  const nextXP = getNextLevelXP(level);
  const currentLevelXP = getXPForLevel(level);
  const progressXP = player.xp - currentLevelXP;
  const neededXP = nextXP - currentLevelXP;

  try {
    switch (commandName) {
      case "rank": {
        const progressBar = createProgressBar(progressXP, neededXP, 10);

        await interaction.reply(
          `🏆 **Rank de ${user.username}**\n` +
            `📊 Nível: **${level}** ${progressBar} ${progressXP}/${neededXP} XP\n` +
            `⭐ XP Total: **${player.xp}**\n` +
            `🎙️ Tempo em call: **${player.totalVoiceMinutes} min**`,
        );
        break;
      }

      case "perfil": {
        const progressBar = createProgressBar(progressXP, neededXP, 15);
        const hours = Math.floor(player.totalVoiceMinutes / 60);
        const mins = player.totalVoiceMinutes % 60;

        await interaction.reply(
          `👤 **Perfil de ${user.username}**\n\n` +
            `🏆 **Nível ${level}** ${progressBar}\n` +
            `⭐ **XP:** ${player.xp} (${progressXP}/${neededXP} para próximo nível)\n` +
            `🎙️ **Tempo total:** ${hours}h ${mins}min (${player.totalVoiceMinutes} min)\n` +
            `📅 **Desde:** <t:${Math.floor(player.lastUpdate / 1000)}:R>`,
        );
        break;
      }

      case "tempo": {
        const hours = Math.floor(player.totalVoiceMinutes / 60);
        const mins = player.totalVoiceMinutes % 60;

        await interaction.reply(
          `🎙️ **Tempo em Call de ${user.username}**\n` +
            `⏱️ Total: **${hours}h ${mins}min** (${player.totalVoiceMinutes} minutos)\n` +
            `⭐ XP ganho: **${player.totalVoiceMinutes * CONFIG.xpPerMinute}**`,
        );
        break;
      }

      case "ranking": {
        // Filtrar apenas membros deste servidor (se em guild)
        let ranking = [...players.entries()];

        if (guildId) {
          const guild = client.guilds.cache.get(guildId);
          if (guild) {
            const memberIds = new Set((await guild.members.fetch()).keys());
            ranking = ranking.filter(([id]) => memberIds.has(id));
          }
        }

        ranking.sort((a, b) => b[1].xp - a[1].xp);
        const top10 = ranking.slice(0, 10);

        if (top10.length === 0) {
          await interaction.reply("📊 Ainda não existem jogadores no ranking.");
          return;
        }

        let text = "🏆 **RANKING KALRANK — TOP 10**\n\n";

        for (let i = 0; i < top10.length; i++) {
          const [uid, data] = top10[i];
          const lvl = getLevel(data.xp);

          // Tentar buscar username (cache primeiro, depois API)
          let username = uid;
          const cachedUser = client.users.cache.get(uid);
          if (cachedUser) {
            username = cachedUser.username;
          } else {
            try {
              const fetched = await client.users.fetch(uid);
              username = fetched.username;
            } catch {
              username = `User ${uid.slice(-4)}`;
            }
          }

          const medal =
            i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `${i + 1}.`;
          text += `${medal} **${username}** — Nv.${lvl} • ${data.xp} XP • ${data.totalVoiceMinutes}min\n`;
        }

        await interaction.reply(text);
        break;
      }
    }
  } catch (error) {
    log("error", `Erro no comando ${commandName}:`, error);

    const msg = "❌ Ocorreu um erro ao processar o comando.";
    if (interaction.replied || interaction.deferred) {
      await interaction.followUp({ content: msg, ephemeral: true });
    } else {
      await interaction.reply({ content: msg, ephemeral: true });
    }
  }
});

// Tratamento de erros
client.on(Events.Error, (error) => {
  log("error", "Erro no cliente Discord:", error);
});

process.on("unhandledRejection", (reason) => {
  log("error", "Unhandled Rejection:", reason);
});

process.on("uncaughtException", (error) => {
  log("error", "Uncaught Exception:", error);
  process.exit(1);
});

// ============ UTILITÁRIOS ============
function createProgressBar(current, max, length = 10) {
  if (max <= 0) return "▰".repeat(length);
  const filled = Math.min(Math.round((current / max) * length), length);
  const empty = length - filled;
  return "▰".repeat(filled) + "▱".repeat(empty);
}

// ============ HEALTH CHECK HTTP ============
const server = createServer((req, res) => {
  // Health check endpoint
  if (req.url === "/health" || req.url === "/") {
    const uptime = process.uptime();
    const mem = process.memoryUsage();

    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        status: "ok",
        bot: client.isReady() ? "connected" : "disconnected",
        uptime: `${Math.floor(uptime / 3600)}h ${Math.floor((uptime % 3600) / 60)}m`,
        players: players.size,
        memory: {
          rss: `${Math.round(mem.rss / 1024 / 1024)} MB`,
          heapUsed: `${Math.round(mem.heapUsed / 1024 / 1024)} MB`,
        },
        timestamp: new Date().toISOString(),
      }),
    );
    return;
  }

  // 404 para outras rotas
  res.writeHead(404, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ error: "Not found" }));
});

server.listen(CONFIG.port, () => {
  log(
    "info",
    `🌐 Health check rodando em http://localhost:${CONFIG.port}/health`,
  );
});

// ============ INICIALIZAÇÃO ============
log("info", "🚀 Iniciando KalRank...");
client.login(CONFIG.token).catch((err) => {
  log("error", "❌ Falha no login:", err);
  process.exit(1);
});

// Graceful shutdown
function shutdown(signal) {
  log("info", `📴 Recebido ${signal}, desligando...`);

  // Salvar dados se necessário (aqui apenas log)
  log("info", `💾 ${players.size} jogadores em memória`);

  client.destroy();
  server.close(() => {
    log("info", "✅ Desligamento completo");
    process.exit(0);
  });

  // Force exit após 10s
  setTimeout(() => {
    log("error", "⚠️ Forçando saída");
    process.exit(1);
  }, 10000);
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
