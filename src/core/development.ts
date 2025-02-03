import { Context, Telegraf } from 'telegraf';
import { Update } from 'telegraf/typings/core/types/typegram';
import createDebug from 'debug';
import { tgAgenticRagLogger } from '../logger';
const debug = createDebug('bot:dev');

const development = async (bot: Telegraf<Context<Update>>) => {
  //const botInfo = (await bot.telegram.getMe()).username;

  //debug('Bot runs in development mode');
  //debug(`${botInfo} deleting webhook`);
  //await bot.telegram.deleteWebhook();
  //debug(`${botInfo} starting polling`);

  process.once('SIGINT', () => {
    tgAgenticRagLogger.logInfo("SIGINT received, stopping bot...");
    return bot.stop('SIGINT');
  });
  process.once('SIGTERM', () => {
    tgAgenticRagLogger.logInfo("SIGTERM received, stopping bot...");
    return bot.stop('SIGTERM');
  });
};

export { development };
