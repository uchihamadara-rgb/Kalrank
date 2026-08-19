/**
 * KalRank - Discord Bot para Ranking por Tempo em Call
 *
 * Comandos:
 * /rank
 * /ranking
 * /perfil
 * /tempo
 *
 * Recursos:
 * - XP por minuto em call
 * - Sistema de níveis
 * - Barra de progresso
 * - Ranking TOP 10
 * - Registro automático dos comandos
 * - Health check para Render
 * - DeferReply para evitar erro 10062 (Unknown interaction)
 * - Atualização automática do tempo em call
 * - Ignora bots
 */

import "dotenv/config";

import {
  Client,
  GatewayIntentBits,
  Events,
  REST,
  Routes,
} from "discord.js";

import { createServer } from "http";

// ============================================================
// CONFIGURAÇÕES
// ============================================================

const CONFIG = {
  port: parseInt(process.env.PORT || "10000", 10),

  token: process.env.DISCORD_TOKEN,

  clientId: process.env.DISCORD_CLIENT_ID,

  xpPerMinute: parseInt(
    process.env.XP_PER_MINUTE || "1",
    10
  ),

  xpBase: parseInt(
    process.env.XP_BASE || "100",
    10
  ),

  logLevel: process.env.LOG_LEVEL || "info",

  // Intervalo para atualizar jogadores em call
  voiceUpdateInterval: 60 * 1000,
};

// ============================================================
// VALIDAÇÕES
// ============================================================

if (!CONFIG.token) {
  console.error(
    "❌ ERRO: DISCORD_TOKEN não definido."
  );

  process.exit(1);
}

if (!CONFIG.clientId) {
  console.warn(
    "⚠️ AVISO: DISCORD_CLIENT_ID não definido."
  );

  console.warn(
    "⚠️ Os comandos slash não serão registrados."
  );
}

// ============================================================
// LOGGER
// ============================================================

const logLevels = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

const currentLogLevel =
  logLevels[CONFIG.logLevel] ?? 1;

function log(level, ...args) {
  if (
    logLevels[level] >=
    currentLogLevel
  ) {
    const prefix =
      level.toUpperCase().padEnd(5);

    console.log(
      `[${new Date().toISOString()}] ${prefix}`,
      ...args
    );
  }
}

// ============================================================
// XP E NÍVEL
// ============================================================

function getLevel(xp) {
  return Math.floor(
    Math.sqrt(
      xp / CONFIG.xpBase
    )
  );
}

function getNextLevelXP(level) {
  return (
    (level + 1) ** 2 *
    CONFIG.xpBase
  );
}

function getXPForLevel(level) {
  return (
    level ** 2 *
    CONFIG.xpBase
  );
}

// ============================================================
// JOGADORES
// ============================================================

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

// ============================================================
// ADICIONAR TEMPO / XP
// ============================================================

function updatePlayerVoiceTime(
  userId,
  minutes
) {
  if (!minutes || minutes <= 0) {
    return;
  }

  const player =
    getPlayer(userId);

  player.totalVoiceMinutes +=
    minutes;

  player.xp +=
    minutes *
    CONFIG.xpPerMinute;

  player.lastUpdate =
    Date.now();
}

// ============================================================
// ATUALIZAR JOGADORES QUE ESTÃO EM CALL
// ============================================================

function updateActiveVoicePlayers() {
  const now = Date.now();

  for (const [
    userId,
    player,
  ] of players.entries()) {
    if (!player.voiceJoinTime) {
      continue;
    }

    const elapsedMinutes =
      Math.floor(
        (now -
          player.voiceJoinTime) /
          60000
      );

    if (elapsedMinutes <= 0) {
      continue;
    }

    updatePlayerVoiceTime(
      userId,
      elapsedMinutes
    );

    // Continua contando a partir
    // do último minuto processado
    player.voiceJoinTime =
      player.voiceJoinTime +
      elapsedMinutes * 60000;

    log(
      "debug",
      `⭐ ${userId} ganhou ${elapsedMinutes} XP por estar em call`
    );
  }
}

// ============================================================
// COMANDOS SLASH
// ============================================================

const COMMANDS = [
  {
    name: "rank",

    description:
      "Mostra seu nível e XP atual",
  },

  {
    name: "ranking",

    description:
      "Mostra o TOP 10 do servidor",
  },

  {
    name: "perfil",

    description:
      "Mostra seu perfil completo no KalRank",
  },

  {
    name: "tempo",

    description:
      "Mostra seu tempo total em call",
  },
];

// ============================================================
// CLIENT DISCORD
// ============================================================

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,

    GatewayIntentBits.GuildMembers,

    GatewayIntentBits.GuildPresences,

    GatewayIntentBits.GuildVoiceStates,
  ],
});

// ============================================================
// BOT ONLINE
// ============================================================

client.once(
  Events.ClientReady,
  async (readyClient) => {
    log(
      "info",
      `✅ KalRank conectado como ${readyClient.user.tag}`
    );

    log(
      "info",
      `📊 Servidores: ${readyClient.guilds.cache.size}`
    );

    // ========================================================
    // REGISTRAR COMANDOS
    // ========================================================

    if (!CONFIG.clientId) {
      return;
    }

    try {
      const rest =
        new REST({
          version: "10",
        }).setToken(
          CONFIG.token
        );

      for (const [
        guildId,
      ] of readyClient.guilds.cache) {
        try {
          await rest.put(
            Routes.applicationGuildCommands(
              CONFIG.clientId,
              guildId
            ),
            {
              body: COMMANDS,
            }
          );

          log(
            "info",
            `✅ Comandos registrados no servidor ${guildId}`
          );
        } catch (error) {
          log(
            "error",
            `❌ Erro ao registrar comandos no servidor ${guildId}:`,
            error
          );
        }
      }

      log(
        "info",
        `✅ Registro dos comandos finalizado`
      );
    } catch (error) {
      log(
        "error",
        "❌ Erro geral ao registrar comandos:",
        error
      );
    }
  }
);

// ============================================================
// ENTRADA / SAÍDA / MUDANÇA DE CALL
// ============================================================

client.on(
  Events.VoiceStateUpdate,
  (
    oldState,
    newState
  ) => {
    const userId =
      newState.id;

    // Ignorar bots
    if (
      newState.member?.user?.bot
    ) {
      return;
    }

    const player =
      getPlayer(userId);

    const now = Date.now();

    // ========================================================
    // ENTROU EM CALL
    // ========================================================

    if (
      !oldState.channelId &&
      newState.channelId
    ) {
      player.voiceJoinTime =
        now;

      player.lastUpdate =
        now;

      log(
        "info",
        `🎙️ ${
          newState.member?.user
            ?.tag || userId
        } entrou na call`
      );

      return;
    }

    // ========================================================
    // SAIU DA CALL
    // ========================================================

    if (
      oldState.channelId &&
      !newState.channelId
    ) {
      if (
        player.voiceJoinTime
      ) {
        const minutes =
          Math.floor(
            (now -
              player.voiceJoinTime) /
              60000
          );

        if (minutes > 0) {
          updatePlayerVoiceTime(
            userId,
            minutes
          );

          log(
            "info",
            `⭐ ${
              newState.member?.user
                ?.tag || userId
            } ganhou ${minutes} XP (${minutes} min)`
          );
        }

        player.voiceJoinTime =
          null;
      }

      return;
    }

    // ========================================================
    // MUDOU DE CANAL
    // ========================================================

    if (
      oldState.channelId &&
      newState.channelId &&
      oldState.channelId !==
        newState.channelId
    ) {
      // O tempo continua contando.
      // Não reiniciamos o relógio.

      log(
        "debug",
        `🔄 ${userId} mudou de canal`
      );

      return;
    }
  }
);

// ============================================================
// ATUALIZAÇÃO AUTOMÁTICA DE VOZ
// ============================================================

setInterval(
  () => {
    try {
      updateActiveVoicePlayers();
    } catch (error) {
      log(
        "error",
        "❌ Erro ao atualizar jogadores em call:",
        error
      );
    }
  },
  CONFIG.voiceUpdateInterval
);

// ============================================================
// INTERAÇÕES
// ============================================================

client.on(
  Events.InteractionCreate,
  async (interaction) => {
    // Ignorar qualquer coisa que não seja
    // comando slash
    if (
      !interaction.isChatInputCommand()
    ) {
      return;
    }

    const {
      commandName,
      user,
      guildId,
    } = interaction;

    try {
      // ======================================================
      // IMPORTANTE
      //
      // O Discord exige uma resposta rápida.
      //
      // deferReply() informa ao Discord:
      // "Recebi o comando e estou processando."
      //
      // Depois usamos editReply().
      // ======================================================

      await interaction.deferReply();

      const player =
        getPlayer(user.id);

      // Atualizar o tempo atual do jogador
      // antes de mostrar os dados
      if (
        player.voiceJoinTime
      ) {
        const now =
          Date.now();

        const minutes =
          Math.floor(
            (now -
              player.voiceJoinTime) /
              60000
          );

        if (minutes > 0) {
          updatePlayerVoiceTime(
            user.id,
            minutes
          );

          player.voiceJoinTime =
            player.voiceJoinTime +
            minutes * 60000;
        }
      }

      const level =
        getLevel(player.xp);

      const nextXP =
        getNextLevelXP(level);

      const currentLevelXP =
        getXPForLevel(level);

      const progressXP =
        Math.max(
          0,
          player.xp -
            currentLevelXP
        );

      const neededXP =
        Math.max(
          1,
          nextXP -
            currentLevelXP
        );

      // ======================================================
      // RANK
      // ======================================================

      if (
        commandName === "rank"
      ) {
        const progressBar =
          createProgressBar(
            progressXP,
            neededXP,
            10
          );

        await interaction.editReply(
          `🏆 **Rank de ${user.username}**\n\n` +
            `📊 Nível: **${level}**\n` +
            `${progressBar} **${progressXP}/${neededXP} XP**\n\n` +
            `⭐ XP Total: **${player.xp}**\n` +
            `🎙️ Tempo em call: **${formatTime(
              player.totalVoiceMinutes
            )}**`
        );

        return;
      }

      // ======================================================
      // PERFIL
      // ======================================================

      if (
        commandName === "perfil"
      ) {
        const progressBar =
          createProgressBar(
            progressXP,
            neededXP,
            15
          );

        await interaction.editReply(
          `👤 **Perfil de ${user.username}**\n\n` +
            `🏆 **Nível ${level}**\n` +
            `${progressBar}\n\n` +
            `⭐ **XP:** ${player.xp}\n` +
            `📈 **Progresso:** ${progressXP}/${neededXP} XP\n` +
            `🎙️ **Tempo total:** ${formatTime(
              player.totalVoiceMinutes
            )}\n` +
            `📅 **Última atualização:** <t:${Math.floor(
              player.lastUpdate /
                1000
            )}:R>`
        );

        return;
      }

      // ======================================================
      // TEMPO
      // ======================================================

      if (
        commandName === "tempo"
      ) {
        await interaction.editReply(
          `🎙️ **Tempo em Call de ${user.username}**\n\n` +
            `⏱️ Total: **${formatTime(
              player.totalVoiceMinutes
            )}**\n` +
            `⭐ XP ganho: **${
              player.totalVoiceMinutes *
              CONFIG.xpPerMinute
            }**`
        );

        return;
      }

      // ======================================================
      // RANKING
      // ======================================================

      if (
        commandName === "ranking"
      ) {
        let ranking = [
          ...players.entries(),
        ];

        // ----------------------------------------------------
        // FILTRAR MEMBROS DO SERVIDOR
        // ----------------------------------------------------

        if (guildId) {
          const guild =
            client.guilds.cache.get(
              guildId
            );

          if (guild) {
            try {
              const members =
                await guild.members.fetch();

              const memberIds =
                new Set(
                  members.keys()
                );

              ranking =
                ranking.filter(
                  ([id]) =>
                    memberIds.has(id)
                );
            } catch (error) {
              log(
                "warn",
                "⚠️ Não foi possível buscar todos os membros:",
                error
              );
            }
          }
        }

        // ----------------------------------------------------
        // ORDENAR POR XP
        // ----------------------------------------------------

        ranking.sort(
          (a, b) =>
            b[1].xp -
            a[1].xp
        );

        const top10 =
          ranking.slice(0, 10);

        // ----------------------------------------------------
        // RANKING VAZIO
        // ----------------------------------------------------

        if (
          top10.length === 0
        ) {
          await interaction.editReply(
            "📊 **Ainda não existem jogadores no ranking.**"
          );

          return;
        }

        // ----------------------------------------------------
        // MONTAR RANKING
        // ----------------------------------------------------

        let text =
          "🏆 **RANKING KALRANK — TOP 10**\n\n";

        for (
          let i = 0;
          i < top10.length;
          i++
        ) {
          const [
            uid,
            data,
          ] = top10[i];

          const lvl =
            getLevel(data.xp);

          let username =
            `User ${uid.slice(
              -4
            )}`;

          try {
            const fetchedUser =
              await client.users.fetch(
                uid
              );

            username =
              fetchedUser.username;
          } catch {
            // Mantém nome padrão
          }

          const medal =
            i === 0
              ? "🥇"
              : i === 1
              ? "🥈"
              : i === 2
              ? "🥉"
              : `**${i + 1}.**`;

          text +=
            `${medal} **${username}**\n` +
            `> 🏆 Nv. ${lvl} • ⭐ ${data.xp} XP • 🎙️ ${formatTime(
              data.totalVoiceMinutes
            )}\n\n`;
        }

        await interaction.editReply(
          text
        );

        return;
      }

      // ======================================================
      // COMANDO DESCONHECIDO
      // ======================================================

      await interaction.editReply(
        "❌ Comando desconhecido."
      );
    } catch (error) {
      log(
        "error",
        `❌ Erro no comando ${commandName}:`,
        error
      );

      try {
        // Se já fizemos deferReply(),
        // usamos editReply().
        if (
          interaction.deferred
        ) {
          await interaction.editReply(
            "❌ Ocorreu um erro ao processar o comando."
          );

          return;
        }

        // Caso ainda não tenha sido respondida
        if (
          !interaction.replied
        ) {
          await interaction.reply(
            {
              content:
                "❌ Ocorreu um erro ao processar o comando.",
              ephemeral: true,
            }
          );
        }
      } catch (replyError) {
        log(
          "error",
          "❌ Não foi possível enviar mensagem de erro:",
          replyError
        );
      }
    }
  }
);

// ============================================================
// TRATAMENTO DE ERROS DO DISCORD
// ============================================================

client.on(
  Events.Error,
  (error) => {
    log(
      "error",
      "❌ Erro no cliente Discord:",
      error
    );
  }
);

// ============================================================
// PROMISES NÃO TRATADAS
// ============================================================

process.on(
  "unhandledRejection",
  (reason) => {
    log(
      "error",
      "❌ Unhandled Rejection:",
      reason
    );
  }
);

// ============================================================
// EXCEÇÕES NÃO TRATADAS
// ============================================================

process.on(
  "uncaughtException",
  (error) => {
    log(
      "error",
      "❌ Uncaught Exception:",
      error
    );

    process.exit(1);
  }
);

// ============================================================
// BARRA DE PROGRESSO
// ============================================================

function createProgressBar(
  current,
  max,
  length = 10
) {
  if (max <= 0) {
    return "▰".repeat(
      length
    );
  }

  const percentage =
    Math.max(
      0,
      Math.min(
        current / max,
        1
      )
    );

  const filled =
    Math.round(
      percentage *
        length
    );

  const empty =
    length - filled;

  return (
    "▰".repeat(filled) +
    "▱".repeat(empty)
  );
}

// ============================================================
// FORMATAR TEMPO
// ============================================================

function formatTime(minutes) {
  const safeMinutes =
    Math.max(
      0,
      Math.floor(minutes)
    );

  const hours =
    Math.floor(
      safeMinutes / 60
    );

  const mins =
    safeMinutes % 60;

  if (hours === 0) {
    return `${mins}min`;
  }

  return `${hours}h ${mins}min`;
}

// ============================================================
// HEALTH CHECK
// ============================================================

const server =
  createServer(
    (req, res) => {
      if (
        req.url === "/health" ||
        req.url === "/"
      ) {
        const uptime =
          process.uptime();

        const mem =
          process.memoryUsage();

        res.writeHead(
          200,
          {
            "Content-Type":
              "application/json",
          }
        );

        res.end(
          JSON.stringify({
            status: "ok",

            bot: client.isReady()
              ? "connected"
              : "disconnected",

            uptime:
              `${Math.floor(
                uptime / 3600
              )}h ${Math.floor(
                (uptime % 3600) /
                  60
              )}m`,

            players:
              players.size,

            memory: {
              rss:
                `${Math.round(
                  mem.rss /
                    1024 /
                    1024
                )} MB`,

              heapUsed:
                `${Math.round(
                  mem.heapUsed /
                    1024 /
                    1024
                )} MB`,
            },

            timestamp:
              new Date().toISOString(),
          })
        );

        return;
      }

      res.writeHead(
        404,
        {
          "Content-Type":
            "application/json",
        }
      );

      res.end(
        JSON.stringify({
          error:
            "Not found",
        })
      );
    }
  );

// ============================================================
// INICIAR SERVIDOR
// ============================================================

server.listen(
  CONFIG.port,
  () => {
    log(
      "info",
      `🌐 Health check rodando na porta ${CONFIG.port}`
    );
  }
);

// ============================================================
// LOGIN DO BOT
// ============================================================

log(
  "info",
  "🚀 Iniciando KalRank..."
);

client
  .login(CONFIG.token)
  .catch(
    (error) => {
      log(
        "error",
        "❌ Falha no login do Discord:",
        error
      );

      process.exit(1);
    }
  );

// ============================================================
// DESLIGAMENTO
// ============================================================

function shutdown(
  signal
) {
  log(
    "info",
    `📴 Recebido ${signal}, desligando...`
  );

  log(
    "info",
    `💾 ${players.size} jogadores em memória`
  );

  try {
    client.destroy();
  } catch (error) {
    log(
      "error",
      "Erro ao desligar cliente:",
      error
    );
  }

  server.close(
    () => {
      log(
        "info",
        "✅ Desligamento completo"
      );

      process.exit(0);
    }
  );

  setTimeout(
    () => {
      log(
        "error",
        "⚠️ Forçando saída"
      );

      process.exit(1);
    },
    10000
  );
}

process.on(
  "SIGTERM",
  () =>
    shutdown("SIGTERM")
);

process.on(
  "SIGINT",
  () =>
    shutdown("SIGINT")
);
