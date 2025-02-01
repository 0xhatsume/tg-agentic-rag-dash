import { Context } from 'telegraf';
import { tgAgenticRagLogger } from '../logger';

const about = () => async (ctx: Context) => {
  const message = `This is a test Tg Agentic RAG bot`;
  tgAgenticRagLogger.info(`[about_command] Triggered with message \n${message}`);
  await ctx.replyWithMarkdownV2(message, { parse_mode: 'Markdown' });
};

export { about };
