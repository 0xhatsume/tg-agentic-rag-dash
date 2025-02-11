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
const MODEL_TOKEN = process.env.OPENAI_API_KEY || process.env.ANTHROPIC_API_KEY || '';
const ENVIRONMENT = process.env.NODE_ENV || '';
const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || '';
const AGENT_ID = process.env.AGENT_ID || '';
//prod mode (Vercel)
export const startVercel = async (req: VercelRequest, res: VercelResponse) => {
  
  const db = new SupabaseDatabaseAdapter(
    SUPABASE_URL,
    SUPABASE_ANON_KEY
  ) as unknown as IDatabaseAdapter & IDatabaseCacheAdapter & { supabase: any };

  await db.init();

  let agentDetails  =  mainCharacter;

  if (AGENT_ID) {
    // Create default agent details
    const defaultDetails = {
      agent_id: AGENT_ID,
      system_prompt: '',
      bio: [],
      lore: [],
      topics: [],
      adjectives: [],
      style: {
        all: [],
        chat: [],
        post: []
      },
      message_examples: [],
      post_examples: []
    };

    const { data: newData, error: insertError } = await (db as any).supabase
      .from('agent_details')
      .insert(defaultDetails)
      .select()
      .single();

    if (insertError) {
      console.error('Error creating default agent details:', insertError);
    } else {
      console.log('Default agent details retrieved successfully');
      agentDetails = {
                        ...agentDetails,
                        ...newData
                      }
    }
  }

  agentDetails.id ??= stringToUuid(agentDetails.name);
  const cache = new CacheManager(new DbCacheAdapter(db, agentDetails.id));
  
  const rt: AgentRuntime = await createAgent(
    agentDetails,
    db,
    cache,
    MODEL_TOKEN);
  
  const tgClient = new TelegramClient(rt, BOT_TOKEN);
  await tgClient.start();
  
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