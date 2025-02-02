import { VercelRequest, VercelResponse } from '@vercel/node';
import { development, production } from './core';
import { TelegramClient } from './clients/telegram/telegramClient';
import { AgentRuntime } from './core/runtime';
import { createAgent } from './core/createAgent';
import { mainCharacter } from './agents/characters/mainCharacter';
import { IDatabaseAdapter, IDatabaseCacheAdapter, ICacheManager } from './core/types';
import { CacheManager, DbCacheAdapter } from './core/cache';
import { SupabaseDatabaseAdapter } from './databases/adapter-supabase';
import { stringToUuid } from './utils';

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';
const ENVIRONMENT = process.env.NODE_ENV || '';

//prod mode (Vercel)
export const startVercel = async (req: VercelRequest, res: VercelResponse) => {
  
  const db = new SupabaseDatabaseAdapter(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_ANON_KEY!
  ) as unknown as IDatabaseAdapter & IDatabaseCacheAdapter;

  await db.init();

  mainCharacter.id ??= stringToUuid(mainCharacter.name);
  const cache = new CacheManager(new DbCacheAdapter(db, mainCharacter.id));

  const rt: AgentRuntime = await createAgent(
    mainCharacter,
    db,
    cache,
    BOT_TOKEN);
  
  const tgClient = new TelegramClient(rt, BOT_TOKEN);
  tgClient.start();
  
  if (ENVIRONMENT === 'production') {
    await production(req, res, tgClient.bot);
  } else {
    // Dev Mode
    await development(tgClient.bot);
  }
  
};

//dev mode
if (ENVIRONMENT !== 'production') {
  // Create mock request and response objects
  const mockReq = {} as VercelRequest;
  const mockRes = {
    status: (code: number) => ({ json: (data: any) => {} }),
    json: (data: any) => {},
  } as VercelResponse;
  
  startVercel(mockReq, mockRes);
}