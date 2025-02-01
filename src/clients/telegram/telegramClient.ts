import { Context, Telegraf } from "telegraf";
import { message } from "telegraf/filters";
import { tgAgenticRagLogger } from '../../logger';
import { IAgentRuntime } from "../../core/types";
import { MessageManager } from "./messageManager";
import { about } from '../../commands';
import { greeting } from '../../text';


const ENVIRONMENT = process.env.NODE_ENV || '';

export class TelegramClient {

    public bot: Telegraf<Context>;
    private runtime: IAgentRuntime;
    private messageManager: MessageManager;

    constructor(runtime: IAgentRuntime, botToken:string) {
        this.bot = new Telegraf(botToken);
        this.runtime = runtime;
        this.messageManager = new MessageManager(this.bot, this.runtime);
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
        //await this.bot.launch({ dropPendingUpdates: true }); only for dev mode
        tgAgenticRagLogger.logInfo("✨ Telegram bot successfully launched and is running!");

        const botInfo = await this.bot.telegram.getMe();
        this.bot.botInfo = botInfo;
        tgAgenticRagLogger.logSuccess(`Bot username: @${botInfo.username}`);

        this.messageManager.bot = this.bot;
    }

    private setupMessageHandlers(): void {
        tgAgenticRagLogger.logInfo("Setting up message handlers...");

        this.bot.on(message("new_chat_members"), async (ctx) => {
            try {
                const newMembers = ctx.message.new_chat_members;
                const isBotAdded = newMembers.some(
                    (member) => member.id === ctx.botInfo.id
                );

                if (isBotAdded 
                    
                    //&& !(await this.isGroupAuthorized(ctx))
                ) {
                    tgAgenticRagLogger.logInfo("Bot added to group");
                    await ctx.reply("Ah, I see new fellow Bot has been added here!");
                    return;
                }
            } catch (error) {
                tgAgenticRagLogger.logError(
                    "Error handling new chat members:", 
                    error);
            }
        });

        this.bot.command('about', about());
        
        this.bot.on('message', async (ctx) => {
            if (ENVIRONMENT !== 'production'){
                greeting()
            }
            else{
                try{
                    tgAgenticRagLogger.logInfo(`Received message in chat ${ctx.chat?.id} from user ${ctx.from?.username || 'unknown'}`);

                    // Check group authorization first
                    // if (!(await this.isGroupAuthorized(ctx))) {
                    //     tgAgenticRagLogger.logWarn(`Unauthorized access attempt in chat ${ctx.chat?.id}`);
                    //     return;
                    // }

                    // TODO: Check if this is trader

                    await this.messageManager.handleMessage(ctx);
                }
                catch(error){
                    tgAgenticRagLogger.logError("Error handling message:", error);

                    // Don't try to reply if we've left the group or been kicked
                    if ((error as any)?.response?.error_code !== 403) {
                        try {
                            await ctx.reply("An error occurred while processing your message.");
                        } catch (replyError) {
                            tgAgenticRagLogger.logError("Failed to send error message:", {
                                error: replyError,
                                originalError: error,
                                chatId: ctx.chat?.id
                            });
                        }
                    }
                }
            }
        });

        this.bot.on("photo", (ctx) => {
            tgAgenticRagLogger.logInfo(
                "📸 Received photo message with caption:",
                ctx.message.caption
            );
        });

        this.bot.on("document", (ctx) => {
            tgAgenticRagLogger.logInfo(
                "📎 Received document message:",
                ctx.message.document.file_name
            );
        });

        this.bot.catch((err, ctx) => {
            tgAgenticRagLogger.logError(`Telegram Error:`, {
                error: err,
                stack: (err as Error).stack,
                updateType: ctx.updateType,
                chatId: ctx.chat?.id,
                userId: ctx.from?.id,
                botInfo: this.bot.botInfo?.username
            });

            ctx.reply("An unexpected error occurred. Please try again later.")
                .catch(replyError => {
                    tgAgenticRagLogger.logError("Failed to send error message:", {
                        error: replyError,
                        originalError: err,
                        chatId: ctx.chat?.id
                    });
                });
        });
    }
}
