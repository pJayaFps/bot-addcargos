require('dotenv').config();

const {
  ChannelType,
  Client,
  EmbedBuilder,
  Events,
  GatewayIntentBits,
  PermissionFlagsBits,
} = require('discord.js');

const requiredEnvVars = ['DISCORD_TOKEN'];
for (const envName of requiredEnvVars) {
  if (!process.env[envName]) {
    throw new Error(`Variável de ambiente obrigatória ausente: ${envName}`);
  }
}

const MEMBER_DELAY_MS = Number(process.env.MEMBER_DELAY_MS ?? 700);
const PROGRESS_UPDATE_EVERY = Number(process.env.PROGRESS_UPDATE_EVERY ?? 5);
const PROGRESS_BAR_SIZE = Number(process.env.PROGRESS_BAR_SIZE ?? 20);

if (Number.isNaN(MEMBER_DELAY_MS) || MEMBER_DELAY_MS < 0) {
  throw new Error('MEMBER_DELAY_MS deve ser um número >= 0');
}

if (Number.isNaN(PROGRESS_UPDATE_EVERY) || PROGRESS_UPDATE_EVERY <= 0) {
  throw new Error('PROGRESS_UPDATE_EVERY deve ser um número > 0');
}

if (Number.isNaN(PROGRESS_BAR_SIZE) || PROGRESS_BAR_SIZE <= 0) {
  throw new Error('PROGRESS_BAR_SIZE deve ser um número > 0');
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
  ],
});

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function parseExcludedIds(rawExcludedIds) {
  if (!rawExcludedIds) {
    return new Set();
  }

  return new Set(
    rawExcludedIds
      .split(',')
      .map((id) => id.trim())
      .filter(Boolean),
  );
}

function buildProgressBar(processed, total) {
  const safeTotal = Math.max(total, 1);
  const ratio = Math.min(Math.max(processed / safeTotal, 0), 1);
  const filledLength = Math.round(PROGRESS_BAR_SIZE * ratio);
  const emptyLength = PROGRESS_BAR_SIZE - filledLength;
  const percent = Math.round(ratio * 100);

  const bar = `${'█'.repeat(filledLength)}${'░'.repeat(emptyLength)}`;

  return {
    bar,
    percent,
    ratio,
  };
}

function buildProgressEmbed({
  status,
  processed,
  total,
  added,
  ignored,
  alreadyHadRole,
}) {
  const { bar, percent } = buildProgressBar(processed, total);

  return new EmbedBuilder()
    .setTitle('Operação /setarcargo em andamento')
    .setColor(status === 'Concluído ✅' ? 0x57f287 : 0x5865f2)
    .setDescription([
      `**Status:** ${status}`,
      `**Progresso:** ${bar} ${percent}%`,
      `**Processados:** ${processed}/${total}`,
      '',
      `✅ Receberam cargo: **${added}**`,
      `⏭️ Ignorados (bots/exclusão): **${ignored}**`,
      `ℹ️ Já tinham cargo: **${alreadyHadRole}**`,
    ].join('\n'))
    .setTimestamp();
}

function buildSummaryEmbed({
  guildName,
  roleId,
  excludedIdsCount,
  processed,
  added,
  ignored,
  alreadyHadRole,
}) {
  return new EmbedBuilder()
    .setTitle('Resumo da operação /setarcargo')
    .setColor(0x57f287)
    .setDescription([
      `🏠 Servidor: **${guildName}**`,
      `🎯 Cargo definido: <@&${roleId}> (\`${roleId}\`)`,
      `🚫 IDs na exclusão: **${excludedIdsCount}**`,
      '',
      `👥 Total de membros processados: **${processed}**`,
      `✅ Quantidade que recebeu o cargo: **${added}**`,
      `⏭️ Quantidade ignorada: **${ignored}**`,
      `ℹ️ Quantidade que já tinha o cargo: **${alreadyHadRole}**`,
    ].join('\n'))
    .setTimestamp();
}

async function ensureBotCanManageRole(guild, role) {
  const me = await guild.members.fetchMe();

  if (!me.permissions.has(PermissionFlagsBits.ManageRoles)) {
    throw new Error('O bot não possui permissão de "Gerenciar Cargos".');
  }

  if (role.managed) {
    throw new Error('Esse cargo é gerenciado por integração e não pode ser alterado manualmente.');
  }

  if (role.position >= me.roles.highest.position) {
    throw new Error('O cargo informado está acima (ou no mesmo nível) do maior cargo do bot.');
  }
}

client.once(Events.ClientReady, (readyClient) => {
  console.log(`✅ Bot online como ${readyClient.user.tag}`);
});

client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isChatInputCommand()) {
    return;
  }

  if (interaction.commandName !== 'setarcargo') {
    return;
  }

  if (!interaction.inCachedGuild()) {
    await interaction.reply({
      content: 'Este comando só pode ser executado dentro de um servidor.',
      ephemeral: true,
    });
    return;
  }

  const hasAdmin = interaction.memberPermissions?.has(PermissionFlagsBits.Administrator);
  if (!hasAdmin) {
    await interaction.reply({
      content: 'Apenas administradores podem usar este comando.',
      ephemeral: true,
    });
    return;
  }

  const roleId = interaction.options.getString('cargo_id', true);
  const rawExcludedIds = interaction.options.getString('excluir_ids', false);
  const logChannelId = interaction.options.getString('canal_log_id', true);

  await interaction.deferReply({ ephemeral: true });

  try {
    const guild = interaction.guild;

    const role = await guild.roles.fetch(roleId).catch(() => null);
    if (!role) {
      throw new Error('Cargo inválido. Verifique o ID informado em cargo_id.');
    }

    await ensureBotCanManageRole(guild, role);

    const logChannel = await guild.channels.fetch(logChannelId).catch(() => null);
    if (!logChannel || !logChannel.isTextBased() || logChannel.type === ChannelType.GuildCategory) {
      throw new Error('Canal inválido. Informe um canal de texto válido em canal_log_id.');
    }

    const excludedIds = parseExcludedIds(rawExcludedIds);

    await guild.members.fetch();
    const members = Array.from(guild.members.cache.values());
    const totalMembers = members.length;

    let processed = 0;
    let added = 0;
    let ignored = 0;
    let alreadyHadRole = 0;

    const initialEmbed = buildProgressEmbed({
      status: 'Em execução ⏳',
      processed,
      total: totalMembers,
      added,
      ignored,
      alreadyHadRole,
    });

    const progressMessage = await logChannel.send({ embeds: [initialEmbed] });

    for (const member of members) {
      processed += 1;

      if (member.user.bot || excludedIds.has(member.id)) {
        ignored += 1;
      } else if (member.roles.cache.has(role.id)) {
        alreadyHadRole += 1;
      } else {
        try {
          await member.roles.add(role, `Atribuição em massa por ${interaction.user.tag} (/setarcargo)`);
          added += 1;
        } catch (roleError) {
          console.error(`Falha ao adicionar cargo ao membro ${member.id}:`, roleError);
          ignored += 1;
        }
      }

      const shouldUpdateProgress =
        processed % PROGRESS_UPDATE_EVERY === 0 ||
        processed === totalMembers;

      if (shouldUpdateProgress) {
        const progressEmbed = buildProgressEmbed({
          status: processed === totalMembers ? 'Finalizando…' : 'Em execução ⏳',
          processed,
          total: totalMembers,
          added,
          ignored,
          alreadyHadRole,
        });

        await progressMessage.edit({ embeds: [progressEmbed] });
      }

      await sleep(MEMBER_DELAY_MS);
    }

    const finalProgressEmbed = buildProgressEmbed({
      status: 'Concluído ✅',
      processed: totalMembers,
      total: totalMembers,
      added,
      ignored,
      alreadyHadRole,
    });

    await progressMessage.edit({ embeds: [finalProgressEmbed] });

    const summaryEmbed = buildSummaryEmbed({
      guildName: guild.name,
      roleId: role.id,
      excludedIdsCount: excludedIds.size,
      processed,
      added,
      ignored,
      alreadyHadRole,
    });

    await logChannel.send({ embeds: [summaryEmbed] });

    await interaction.editReply({
      content: `Operação concluída com sucesso. Resumo enviado em <#${logChannel.id}>.`,
    });
  } catch (error) {
    console.error('Erro no comando /setarcargo:', error);

    await interaction.editReply({
      content: `❌ Falha ao executar /setarcargo: ${error.message}`,
    });
  }
});

client.login(process.env.DISCORD_TOKEN);
