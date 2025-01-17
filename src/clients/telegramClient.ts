import { Context, Telegraf } from "telegraf";
import { message } from "telegraf/filters";
import { tgAgenticRagLogger } from '../logger';


import { about } from '../commands';
import { greeting } from '../text';

const ENVIRONMENT = process.env.NODE_ENV || '';

export class TelegramClient {

    public bot: Telegraf<Context>;
    private messageManager: any;

    constructor(botToken:string) {
        this.bot = new Telegraf(botToken);
    }

    public async start(): Promise<void> {
        try
        {
            await this.initBot();
            this.setupMessageHandlers();
        }
        catch(error)
        {
            tgAgenticRagLogger.logError("❌ Failed to launch Telegram bot:", error);
            throw error;
        }
    }

    private async initBot(): Promise<void> {
        await this.bot.launch({ dropPendingUpdates: true });
        tgAgenticRagLogger.logInfo("✨ Telegram bot successfully launched and is running!");

        const botInfo = await this.bot.telegram.getMe();
        this.bot.botInfo = botInfo;
        tgAgenticRagLogger.success(`Bot username: @${botInfo.username}`);

        this.messageManager.bot = this.bot;
    }

    private setupMessageHandlers(): void {

        this.bot.command('about', about());
        this.bot.on('message', greeting());
    }
}
