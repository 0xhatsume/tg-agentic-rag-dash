import { VercelRequest, VercelResponse } from '@vercel/node';
import { development, production } from './core';
import { TelegramClient } from './clients/telegramClient';
const BOT_TOKEN = process.env.BOT_TOKEN || '';
const ENVIRONMENT = process.env.NODE_ENV || '';

const tgClient = new TelegramClient(BOT_TOKEN);
tgClient.start();

//prod mode (Vercel)
export const startVercel = async (req: VercelRequest, res: VercelResponse) => {
  await production(req, res, tgClient.bot);
};
//dev mode
ENVIRONMENT !== 'production' && development(tgClient.bot);
