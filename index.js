const {
  Client,
  GatewayIntentBits,
  Events
} = require("discord.js");

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildPresences,
    GatewayIntentBits.GuildVoiceStates
  ]
});

// Armazena os jogadores em memória
const players = new Map();

// Configurações
const XP_PER_MINUTE = 1;
const XP_PER_MESSAGE = 2;

// Calcula o nível baseado no XP
function getLevel(xp) {
  return Math.floor(Math.sqrt(xp / 100));
}

// Calcula o XP necessário para o próximo nível
function getNextLevelXP(level) {
  return Math.pow(level + 1, 2) * 100;
}

// Cria o jogador caso ele ainda não exista
function getPlayer(userId) {
  if (!players.has(userId)) {
    players.set(userId, {
      xp: 0,
      voiceJoinTime: null,
      totalVoiceMinutes: 0
    });
  }

  return players.get(userId);
}

// Quando o bot ligar
client.once(Events.ClientReady, async (readyClient) => {
  console.log(`KalRank conectado como ${readyClient.user.tag}`);

  try {
    await readyClient.application.commands.set([
      {
        name: "rank",
        description: "Mostra seu nível e XP."
      },
      {
        name: "ranking",
        description: "Mostra o ranking do servidor."
      },
      {
        name: "perfil",
        description: "Mostra seu perfil no KalRank."
      },
      {
        name: "tempo",
        description: "Mostra seu tempo em call."
      }
    ]);

    console.log("Comandos registrados.");
  } catch (error) {
    console.error("Erro ao registrar comandos:", error);
  }
});

// Detecta entrada/saída/mudança de canal de voz
client.on(Events.VoiceStateUpdate, (oldState, newState) => {
  const userId = newState.id;
  const player = getPlayer(userId);

  // Entrou em uma call
  if (!oldState.channelId && newState.channelId) {
    player.voiceJoinTime = Date.now();

    console.log(`${newState.member?.user.tag || userId} entrou na call.`);
  }

  // Saiu da call
  if (oldState.channelId && !newState.channelId) {
    if (player.voiceJoinTime) {
      const minutes = Math.floor(
        (Date.now() - player.voiceJoinTime) / 60000
      );

      player.totalVoiceMinutes += minutes;
      player.xp += minutes * XP_PER_MINUTE;
      player.voiceJoinTime = null;

      console.log(
        `${newState.member?.user.tag || userId} ficou ${minutes} minutos em call.`
      );
    }
  }
});

// Comandos
client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  const player = getPlayer(interaction.user.id);
  const level = getLevel(player.xp);

  if (interaction.commandName === "rank") {
    const nextXP = getNextLevelXP(level);

    await interaction.reply(
      `🏆 **${interaction.user.username}**\n` +
      `Nível: **${level}**\n` +
      `XP: **${player.xp}**\n` +
      `Próximo nível: **${nextXP} XP**`
    );
  }

  if (interaction.commandName === "perfil") {
    await interaction.reply(
      `👤 **Perfil de ${interaction.user.username}**\n\n` +
      `🏆 Nível: **${level}**\n` +
      `⭐ XP: **${player.xp}**\n` +
      `🎙️ Tempo em call: **${player.totalVoiceMinutes} minutos**`
    );
  }

  if (interaction.commandName === "tempo") {
    await interaction.reply(
      `🎙️ Você acumulou **${player.totalVoiceMinutes} minutos** em call.`
    );
  }

  if (interaction.commandName === "ranking") {
    const ranking = [...players.entries()]
      .sort((a, b) => b[1].xp - a[1].xp)
      .slice(0, 10);

    if (ranking.length === 0) {
      return interaction.reply("📊 Ainda não existem jogadores no ranking.");
    }

    let text = "🏆 **RANKING KALRANK**\n\n";

    for (let i = 0; i < ranking.length; i++) {
      const [userId, data] = ranking[i];

      const user = await client.users.fetch(userId).catch(() => null);

      text += `${i + 1}. **${user?.username || userId}** — ${data.xp} XP\n`;
    }

    await interaction.reply(text);
  }
});

// Token
const token = process.env.DISCORD_TOKEN;

if (!token) {
  console.error("ERRO: DISCORD_TOKEN não foi configurado.");
  process.exit(1);
}

client.login(token);
