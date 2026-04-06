require('dotenv').config();

const { REST, Routes, SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');

const requiredEnvVars = ['DISCORD_TOKEN', 'DISCORD_CLIENT_ID', 'DISCORD_GUILD_ID'];
for (const envName of requiredEnvVars) {
  if (!process.env[envName]) {
    throw new Error(`Variável de ambiente obrigatória ausente: ${envName}`);
  }
}

const commands = [
  new SlashCommandBuilder()
    .setName('setarcargo')
    .setDescription('Adiciona um cargo para todos os membros elegíveis do servidor')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addStringOption((option) =>
      option
        .setName('cargo_id')
        .setDescription('ID do cargo que será adicionado')
        .setRequired(true),
    )
    .addStringOption((option) =>
      option
        .setName('excluir_ids')
        .setDescription('IDs de usuários para excluir, separados por vírgula')
        .setRequired(false),
    )
    .addStringOption((option) =>
      option
        .setName('canal_log_id')
        .setDescription('ID do canal para log e progresso da operação')
        .setRequired(true),
    ),
].map((command) => command.toJSON());

const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

async function registerCommands() {
  console.log('🔁 Registrando comandos slash...');

  await rest.put(
    Routes.applicationGuildCommands(process.env.DISCORD_CLIENT_ID, process.env.DISCORD_GUILD_ID),
    { body: commands },
  );

  console.log('✅ Comando /setarcargo registrado com sucesso.');
}

registerCommands().catch((error) => {
  console.error('❌ Erro ao registrar comandos:', error);
  process.exit(1);
});
