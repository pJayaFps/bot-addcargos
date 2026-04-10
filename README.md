# Bot Discord `/setarcargo` (Node.js + discord.js)

Bot administrativo para adicionar um cargo em massa em membros de um servidor, com barra de progresso em tempo real via embed.

## Requisitos

- Node.js 18.17+
- Bot com intent privilegiada **Server Members Intent** ativada no portal do Discord
- Permissão de **Gerenciar Cargos** para o bot
- Cargo do bot acima do cargo que será atribuído

## Instalação

```bash
npm install
cp .env.example .env
```

Preencha as variáveis no `.env`.

## Variáveis de ambiente

- `DISCORD_TOKEN`: token do bot
- `DISCORD_CLIENT_ID`: ID da aplicação/bot
- `DISCORD_GUILD_ID`: ID do servidor (registro de comando em escopo de guild)
- `MEMBER_DELAY_MS` (opcional): delay por membro (padrão `700`)
- `PROGRESS_UPDATE_EVERY` (opcional): atualiza embed a cada X membros (padrão `5`)
- `PROGRESS_BAR_SIZE` (opcional): tamanho da barra de progresso (padrão `20`)

## Registrar comando slash

```bash
npm run register
```

## Executar bot

```bash
npm start
```

## Comando `/setarcargo`

Parâmetros:

- `cargo_id` (string, obrigatório)
- `excluir_ids` (string, opcional, IDs separados por vírgula)
- `canal_log_id` (string, obrigatório)

Fluxo principal:

1. Busca todos os membros do servidor.
2. Ignora bots e IDs da exclusão.
3. Ignora quem já possui o cargo.
4. Adiciona o cargo para quem for elegível.
5. Atualiza embed de progresso periodicamente (`.edit()`).
6. Envia resumo final no canal de log.

## Observações de estabilidade

- Uso de loop assíncrono controlado com `async/await`.
- Delay por usuário para reduzir risco de rate limit.
- Tratamento de erros para cargo/canal inválido, permissões insuficientes e falhas individuais por membro.
