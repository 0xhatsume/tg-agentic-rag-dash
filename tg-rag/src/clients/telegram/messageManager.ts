import { Message } from "@telegraf/types";
import { Context, Telegraf } from "telegraf";
import { IAgentRuntime, Memory, Content, UUID,
    IImageDescriptionService,
    ServiceType,
    ModelClass,
    State,
    HandlerCallback,
    Media
 } from "../../core/types";
import tgAgenticRagLogger from "../../logger";
import { stringToUuid, cosineSimilarity } from "../../utils";
import { composeContext, composeRandomUser } from "../../core/composeContext";
import { 
    telegramMessageHandlerTemplate, 
    telegramShouldRespondTemplate
 } from "../../core/templatesAndParsings";
import { generateMessageResponse, generateShouldRespond } from "../../core/generations";
import { getEmbeddingZeroVector } from "../../core/embedding";
import {
    MESSAGE_CONSTANTS,
    MAX_MESSAGE_LENGTH,
    TIMING_CONSTANTS,
    RESPONSE_CHANCES,
    TEAM_COORDINATION,
} from "./constants";
import fs from "fs";

interface ExtendedError {
    name?: string;
    message?: string;
    stack?: string;
    code?: string | number;
    details?: any;
}

export type InterestChats = {
    [key: string]: {
        currentHandler: string | undefined;
        lastMessageSent: number;
        messages: { userId: UUID; userName: string; content: Content }[];
        previousContext?: MessageContext;
        contextSimilarityThreshold?: number;
    };
};

interface MessageContext {
    content: string;
    timestamp: number;
}

export class MessageManager {
    public bot: Telegraf<Context>;
    private runtime: IAgentRuntime;
    private interestChats: InterestChats = {};
    private teamMemberUsernames: Map<string, string> = new Map();

    constructor(bot: Telegraf<Context>, runtime: IAgentRuntime) {
        this.bot = bot;
        this.runtime = runtime;
    }
    
    private async _initializeTeamMemberUsernames(): Promise<void> {
        if (!this.runtime.character.clientConfig?.telegram?.isPartOfTeam)
            return;

        const teamAgentIds =
            this.runtime.character.clientConfig.telegram.teamAgentIds || [];

        for (const id of teamAgentIds) {
            try {
                const chat = await this.bot.telegram.getChat(id);
                if ("username" in chat && chat.username) {
                    this.teamMemberUsernames.set(id, chat.username);
                    tgAgenticRagLogger.logInfo(
                        `Cached username for team member ${id}: ${chat.username}`
                    );
                }
            } catch (error) {
                tgAgenticRagLogger.logError(
                    `Error getting username for team member ${id}:`,
                    error
                );
            }
        }
    }
    
    private _getTeamMemberUsername(id: string): string | undefined {
        return this.teamMemberUsernames.get(id);
    }

    private _getNormalizedUserId(id: string | number): string {
        return id.toString().replace(/[^0-9]/g, "");
    }

    private _isTeamMember(userId: string | number): boolean {
        const teamConfig = this.runtime.character.clientConfig?.telegram;
        if (!teamConfig?.isPartOfTeam || !teamConfig.teamAgentIds) return false;

        const normalizedUserId = this._getNormalizedUserId(userId);
        return teamConfig.teamAgentIds.some(
            (teamId) => this._getNormalizedUserId(teamId) === normalizedUserId
        );
    }

    private _isTeamLeader(): boolean {
        return (
            this.bot.botInfo?.id.toString() ===
            this.runtime.character.clientConfig?.telegram?.teamLeaderId
        );
    }

    private _isTeamCoordinationRequest(content: string): boolean {
        const contentLower = content.toLowerCase();
        return TEAM_COORDINATION.KEYWORDS?.some((keyword) =>
            contentLower.includes(keyword.toLowerCase())
        );
    }

    private _isRelevantToTeamMember(
        content: string,
        chatId: string,
        lastAgentMemory: Memory | null = null
    ): boolean {
        const teamConfig = this.runtime.character.clientConfig?.telegram;

        // Check leader's context based on last message
        if (this._isTeamLeader() && lastAgentMemory?.content.text) {
            const timeSinceLastMessage = Date.now() - (lastAgentMemory.createdAt ?? 0);
            if (timeSinceLastMessage > MESSAGE_CONSTANTS.INTEREST_DECAY_TIME) {
                return false;
            }

            const similarity = cosineSimilarity(
                content.toLowerCase(),
                lastAgentMemory.content.text.toLowerCase()
            );

            return (
                similarity >=
                MESSAGE_CONSTANTS.DEFAULT_SIMILARITY_THRESHOLD_FOLLOW_UPS
            );
        }

        // Check team member keywords
        if (!teamConfig?.teamMemberInterestKeywords?.length) {
            return false; // If no keywords defined, only leader maintains conversation
        }

        // Check if content matches any team member keywords
        return teamConfig.teamMemberInterestKeywords.some((keyword) =>
            content.toLowerCase().includes(keyword.toLowerCase())
        );
    }

    private async _analyzeContextSimilarity(
        currentMessage: string,
        previousContext?: MessageContext,
        agentLastMessage?: string
    ): Promise<number> {
        if (!previousContext) return 1;

        const timeDiff = Date.now() - previousContext.timestamp;
        const timeWeight = Math.max(0, 1 - timeDiff / (5 * 60 * 1000));

        const similarity = cosineSimilarity(
            currentMessage.toLowerCase(),
            previousContext.content.toLowerCase(),
            agentLastMessage?.toLowerCase()
        );

        return similarity * timeWeight;
    }

    
    private async _shouldRespondBasedOnContext(
        message: Message,
        chatState: InterestChats[string]
    ): Promise<boolean> {
        const messageText =
            "text" in message
                ? message.text
                : "caption" in message
                  ? (message as any).caption
                  : "";

        if (!messageText) return false;

        // Always respond if mentioned
        if (this._isMessageForMe(message)) return true;

        // If we're not the current handler, don't respond
        if (chatState?.currentHandler !== this.bot.botInfo?.id.toString())
            return false;

        // Check if we have messages to compare
        if (!chatState.messages?.length) return false;

        // Get last user message (not from the bot)
        const lastUserMessage = [...chatState.messages].reverse().find(
            (m, index) =>
                index > 0 && // Skip first message (current)
                m.userId !== this.runtime.agentId
        );

        if (!lastUserMessage) return false;

        const lastSelfMemories = await this.runtime.messageManager.getMemories({
            roomId: stringToUuid(
                message.chat.id.toString() + "-" + this.runtime.agentId
            ),
            unique: false,
            count: 5,
        });

        const lastSelfSortedMemories = lastSelfMemories
            ?.filter((m) => m.userId === this.runtime.agentId)
            .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

        // Calculate context similarity
        const contextSimilarity = await this._analyzeContextSimilarity(
            messageText,
            {
                content: lastUserMessage.content.text || "",
                timestamp: Date.now(),
            },
            lastSelfSortedMemories?.[0]?.content?.text
        );

        const similarityThreshold =
            this.runtime.character.clientConfig?.telegram
                ?.messageSimilarityThreshold ||
            chatState.contextSimilarityThreshold ||
            MESSAGE_CONSTANTS.DEFAULT_SIMILARITY_THRESHOLD;

        return contextSimilarity >= similarityThreshold;
    }

    private _isMessageForMe(message: Message): boolean {
        const botUsername = this.bot.botInfo?.username;
        if (!botUsername) return false;

        const messageText =
            "text" in message
                ? message.text
                : "caption" in message
                  ? (message as any).caption
                  : "";
        if (!messageText) return false;

        const isReplyToBot =
            (message as any).reply_to_message?.from?.is_bot === true &&
            (message as any).reply_to_message?.from?.username === botUsername;
        const isMentioned = messageText.includes(`@${botUsername}`);
        const hasUsername = messageText
            .toLowerCase()
            .includes(botUsername.toLowerCase());

        return (
            isReplyToBot ||
            isMentioned ||
            (!this.runtime.character.clientConfig?.telegram
                ?.shouldRespondOnlyToMentions &&
                hasUsername)
        );
    }

    private _checkInterest(chatId: string): boolean {
        const chatState = this.interestChats[chatId];
        if (!chatState) return false;

        const lastMessage = chatState.messages[chatState.messages.length - 1];
        const timeSinceLastMessage = Date.now() - chatState.lastMessageSent;

        if (timeSinceLastMessage > MESSAGE_CONSTANTS.INTEREST_DECAY_TIME) {
            delete this.interestChats[chatId];
            return false;
        } else if (
            timeSinceLastMessage > MESSAGE_CONSTANTS.PARTIAL_INTEREST_DECAY
        ) {
            return this._isRelevantToTeamMember(
                lastMessage?.content.text || "",
                chatId
            );
        }

        // Team leader specific checks
        if (this._isTeamLeader() && chatState.messages.length > 0) {
            if (
                !this._isRelevantToTeamMember(
                    lastMessage?.content.text || "",
                    chatId
                )
            ) {
                const recentTeamResponses = chatState.messages
                    .slice(-3)
                    .some(
                        (m) =>
                            m.userId !== this.runtime.agentId &&
                            this._isTeamMember(m.userId.toString())
                    );

                if (recentTeamResponses) {
                    delete this.interestChats[chatId];
                    return false;
                }
            }
        }

        return true;
    }

    // Process image messages and generate descriptions
    private async processImage(
        message: Message
    ): Promise<{ description: string } | null> {
        // try {
        //     let imageUrl: string | null = null;

        //     tgAgenticRagLogger.logInfo(`Telegram Message: ${message}`);

        //     if ("photo" in message && message.photo?.length > 0) {
        //         const photo = message.photo[message.photo.length - 1];
        //         const fileLink = await this.bot.telegram.getFileLink(
        //             photo.file_id
        //         );
        //         imageUrl = fileLink.toString();
        //     } else if (
        //         "document" in message &&
        //         message.document?.mime_type?.startsWith("image/")
        //     ) {
        //         const fileLink = await this.bot.telegram.getFileLink(
        //             message.document.file_id
        //         );
        //         imageUrl = fileLink.toString();
        //     }

        //     if (imageUrl) {
        //         const imageDescriptionService =
        //             this.runtime.getService<IImageDescriptionService>(
        //                 ServiceType.IMAGE_DESCRIPTION
        //             );
        //         const { title, description } =
        //             await imageDescriptionService.describeImage(imageUrl);
        //         return { description: `[Image: ${title}\n${description}]` };
        //     }
        // } catch (error) {
        //     console.error("❌ Error processing image:", error);
        // }

        return null;
    }

    // Decide if the bot should respond to the message
    private async _shouldRespond(
        message: Message,
        state: State
    ): Promise<boolean> {
        if (
            this.runtime.character.clientConfig?.telegram
                ?.shouldRespondOnlyToMentions
        ) {
            return this._isMessageForMe(message);
        }

        // Respond if bot is mentioned
        if (
            "text" in message &&
            message.text?.includes(`@${this.bot.botInfo?.username}`)
        ) {
            tgAgenticRagLogger.logInfo(`Bot mentioned`);
            return true;
        }

        // Respond to private chats
        if (message.chat.type === "private") {
            return true;
        }

        // Don't respond to images in group chats
        if (
            "photo" in message ||
            ("document" in message &&
                message.document?.mime_type?.startsWith("image/"))
        ) {
            return false;
        }

        const chatId = message.chat.id.toString();
        const chatState = this.interestChats[chatId];
        const messageText =
            "text" in message
                ? message.text
                : "caption" in message
                  ? (message as any).caption
                  : "";

        // Check if team member has direct interest first
        if (
            this.runtime.character.clientConfig?.discord?.isPartOfTeam &&
            !this._isTeamLeader() &&
            this._isRelevantToTeamMember(messageText, chatId)
        ) {
            return true;
        }

        // Team-based response logic
        if (this.runtime.character.clientConfig?.telegram?.isPartOfTeam) {
            // Team coordination
            if (this._isTeamCoordinationRequest(messageText)) {
                if (this._isTeamLeader()) {
                    return true;
                } else {
                    const randomDelay =
                        Math.floor(
                            Math.random() *
                                (TIMING_CONSTANTS.TEAM_MEMBER_DELAY_MAX -
                                    TIMING_CONSTANTS.TEAM_MEMBER_DELAY_MIN)
                        ) + TIMING_CONSTANTS.TEAM_MEMBER_DELAY_MIN; // 1-3 second random delay
                    await new Promise((resolve) =>
                        setTimeout(resolve, randomDelay)
                    );
                    return true;
                }
            }

            if (
                !this._isTeamLeader() &&
                this._isRelevantToTeamMember(messageText, chatId)
            ) {
                // Add small delay for non-leader responses
                await new Promise((resolve) =>
                    setTimeout(resolve, TIMING_CONSTANTS.TEAM_MEMBER_DELAY)
                ); //1.5 second delay

                // If leader has responded in last few seconds, reduce chance of responding
                if (chatState.messages?.length) {
                    const recentMessages = chatState.messages.slice(
                        -MESSAGE_CONSTANTS.RECENT_MESSAGE_COUNT
                    );
                    const leaderResponded = recentMessages.some(
                        (m) =>
                            m.userId ===
                                this.runtime.character.clientConfig?.telegram
                                    ?.teamLeaderId &&
                            Date.now() - chatState.lastMessageSent < 3000
                    );

                    if (leaderResponded) {
                        // 50% chance to respond if leader just did
                        return Math.random() > RESPONSE_CHANCES.AFTER_LEADER;
                    }
                }

                return true;
            }

            // If I'm the leader but message doesn't match my keywords, add delay and check for team responses
            if (
                this._isTeamLeader() &&
                !this._isRelevantToTeamMember(messageText, chatId)
            ) {
                const randomDelay =
                    Math.floor(
                        Math.random() *
                            (TIMING_CONSTANTS.LEADER_DELAY_MAX -
                                TIMING_CONSTANTS.LEADER_DELAY_MIN)
                    ) + TIMING_CONSTANTS.LEADER_DELAY_MIN; // 2-4 second random delay
                await new Promise((resolve) =>
                    setTimeout(resolve, randomDelay)
                );

                // After delay, check if another team member has already responded
                if (chatState?.messages?.length) {
                    const recentResponses = chatState.messages.slice(
                        -MESSAGE_CONSTANTS.RECENT_MESSAGE_COUNT
                    );
                    const otherTeamMemberResponded = recentResponses.some(
                        (m) =>
                            m.userId !== this.runtime.agentId &&
                            this._isTeamMember(m.userId)
                    );

                    if (otherTeamMemberResponded) {
                        return false;
                    }
                }
            }

            // Update current handler if we're mentioned
            if (this._isMessageForMe(message)) {
                const channelState = this.interestChats[chatId];
                if (channelState) {
                    channelState.currentHandler =
                        this.bot.botInfo?.id.toString();
                    channelState.lastMessageSent = Date.now();
                }
                return true;
            }

            // Don't respond if another teammate is handling the conversation
            if (chatState?.currentHandler) {
                if (
                    chatState.currentHandler !==
                        this.bot.botInfo?.id.toString() &&
                    this._isTeamMember(chatState.currentHandler)
                ) {
                    return false;
                }
            }

            // Natural conversation cadence
            if (!this._isMessageForMe(message) && this.interestChats[chatId]) {
                const recentMessages = this.interestChats[
                    chatId
                ].messages.slice(-MESSAGE_CONSTANTS.CHAT_HISTORY_COUNT);
                const ourMessageCount = recentMessages.filter(
                    (m) => m.userId === this.runtime.agentId
                ).length;

                if (ourMessageCount > 2) {
                    const responseChance = Math.pow(0.5, ourMessageCount - 2);
                    if (Math.random() > responseChance) {
                        return false;
                    }
                }
            }
        }

        // Check context-based response for team conversations
        if (chatState?.currentHandler) {
            const shouldRespondContext =
                await this._shouldRespondBasedOnContext(message, chatState);

            if (!shouldRespondContext) {
                return false;
            }
        }

        // Use AI to decide for text or captions
        if ("text" in message || ("caption" in message && message.caption)) {
            const shouldRespondContext = composeContext({
                state,
                template:
                    this.runtime.character.templates
                        ?.telegramShouldRespondTemplate ||
                    this.runtime.character?.templates?.shouldRespondTemplate ||
                    composeRandomUser(telegramShouldRespondTemplate, 2),
            });

            const response = await generateShouldRespond({
                runtime: this.runtime,
                context: shouldRespondContext,
                modelClass: ModelClass.SMALL,
            });

            return response === "RESPOND";
        }

        return false;
    }

    // Send long messages in chunks
    private async sendMessageInChunks(
        ctx: Context,
        content: Content,
        replyToMessageId?: number
    ): Promise<Message.TextMessage[]> {
        if (!ctx.chat) {
            throw new Error('Chat context is undefined');
        }
        if (content.attachments && content.attachments.length > 0) {
            await Promise.all(content.attachments.map(async (attachment: Media) => {
                if (attachment.contentType?.startsWith("image")) {
                    await this.sendImage(ctx, attachment.url, attachment.description);
                }
            }));
            return [];  // Return empty array after handling attachments
        } else {
            const chunks = this.splitMessage(content.text);
            const sentMessages: Message.TextMessage[] = [];

            for (let i = 0; i < chunks.length; i++) {
                const chunk = chunks[i];
                const sentMessage = (await ctx.telegram.sendMessage(
                    ctx.chat.id,
                    chunk,
                    {
                        reply_parameters:
                            i === 0 && replyToMessageId
                                ? { message_id: replyToMessageId }
                                : undefined,
                        parse_mode: "Markdown",
                    }
                )) as Message.TextMessage;

                sentMessages.push(sentMessage);
            }

            return sentMessages;
        }
    }

    private async sendImage(
        ctx: Context,
        imagePath: string,
        caption?: string
    ): Promise<void> {
        if (!ctx.chat) {
            throw new Error('Chat context is undefined');
        }
        try {
            if (/^(http|https):\/\//.test(imagePath)) {
                // Handle HTTP URLs
                await ctx.telegram.sendPhoto(ctx.chat.id, imagePath, {
                    caption,
                });
            } else {
                // Handle local file paths
                if (!fs.existsSync(imagePath)) {
                    throw new Error(`File not found: ${imagePath}`);
                }

                const fileStream = fs.createReadStream(imagePath);

                await ctx.telegram.sendPhoto(
                    ctx.chat.id,
                    {
                        source: fileStream,
                    },
                    {
                        caption,
                    }
                );
            }

            tgAgenticRagLogger.logInfo(`Image sent successfully: ${imagePath}`);
        } catch (error) {
            tgAgenticRagLogger.logError("Error sending image:", error);
        }
    }

    // Split message into smaller parts
    private splitMessage(text: string): string[] {
        const chunks: string[] = [];
        let currentChunk = "";

        const lines = text.split("\n");
        for (const line of lines) {
            if (currentChunk.length + line.length + 1 <= MAX_MESSAGE_LENGTH) {
                currentChunk += (currentChunk ? "\n" : "") + line;
            } else {
                if (currentChunk) chunks.push(currentChunk);
                currentChunk = line;
            }
        }

        if (currentChunk) chunks.push(currentChunk);
        return chunks;
    }

    // Generate a response using AI
    private async _generateResponse(
        message: Memory,
        _state: State,
        context: string
    ): Promise<Content> {
        const { userId, roomId } = message;

        const response = await generateMessageResponse({
            runtime: this.runtime,
            context,
            modelClass: ModelClass.LARGE,
        });

        if (!response) {
            console.error("❌ No response from generateMessageResponse");
            return { text: "", source: "telegram" };
        }

        await this.runtime.databaseAdapter.log({
            body: { message, context, response },
            userId,
            roomId,
            type: "response",
        });

        return response;
    }

    // Main handler for incoming messages
    public async handleMessage(ctx: Context): Promise<void> {
        try {
            if (!ctx.message || !ctx.from) {
                tgAgenticRagLogger.logWarn('Skipping message - missing message or sender info');
                return;
            }

            tgAgenticRagLogger.logInfo('Telegram Message Received:', {
                username: ctx.from.username || 'Unknown',
                chat: {
                    id: ctx.chat?.id,
                    type: ctx.chat?.type
                },
                message: {
                    id: ctx.message.message_id,
                    text: 'text' in ctx.message ? ctx.message.text?.substring(0, 100) : undefined,
                }
            });

            if (
                this.runtime.character.clientConfig?.telegram
                    ?.shouldIgnoreBotMessages &&
                ctx.from.is_bot
            ) {
                return;
            }
            if (
                this.runtime.character.clientConfig?.telegram
                    ?.shouldIgnoreDirectMessages &&
                ctx.chat?.type === "private"
            ) {
                return;
            }

            const message = ctx.message;
            const chatId = ctx.chat?.id.toString();
            if (!chatId) return;
            const messageText =
                "text" in message
                    ? message.text
                    : "caption" in message
                      ? (message as any).caption
                      : "";

            // Add team handling at the start
            if (
                this.runtime.character.clientConfig?.telegram?.isPartOfTeam &&
                !this.runtime.character.clientConfig?.telegram
                    ?.shouldRespondOnlyToMentions
            ) {
                const isDirectlyMentioned = this._isMessageForMe(message);
                const hasInterest = this._checkInterest(chatId);

                // Non-leader team member showing interest based on keywords
                if (
                    !this._isTeamLeader() &&
                    this._isRelevantToTeamMember(messageText, chatId)
                ) {
                    this.interestChats[chatId] = {
                        currentHandler: this.bot.botInfo?.id.toString(),
                        lastMessageSent: Date.now(),
                        messages: [],
                    };
                }

                const isTeamRequest = this._isTeamCoordinationRequest(messageText);
                const isLeader = this._isTeamLeader();

                // Check for continued interest
                if (hasInterest && !isDirectlyMentioned) {
                    const lastSelfMemories =
                        await this.runtime.messageManager.getMemories({
                            roomId: stringToUuid(
                                chatId + "-" + this.runtime.agentId
                            ),
                            unique: false,
                            count: 5,
                        });

                    const lastSelfSortedMemories = lastSelfMemories
                        ?.filter((m) => m.userId === this.runtime.agentId)
                        .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

                    const isRelevant = this._isRelevantToTeamMember(
                        messageText,
                        chatId,
                        lastSelfSortedMemories?.[0]
                    );

                    if (!isRelevant) {
                        delete this.interestChats[chatId];
                        return;
                    }
                }

                // Handle team coordination requests
                if (isTeamRequest) {
                    if (isLeader) {
                        this.interestChats[chatId] = {
                            currentHandler: this.bot.botInfo?.id.toString(),
                            lastMessageSent: Date.now(),
                            messages: [],
                        };
                    } else {
                        this.interestChats[chatId] = {
                            currentHandler: this.bot.botInfo?.id.toString(),
                            lastMessageSent: Date.now(),
                            messages: [],
                        };

                        if (!isDirectlyMentioned) {
                            this.interestChats[chatId].lastMessageSent = 0;
                        }
                    }
                }

                // Check for other team member mentions using cached usernames
                const otherTeamMembers =
                    this.runtime?.character?.clientConfig?.telegram?.teamAgentIds?.filter(
                        (id) => id !== this.bot.botInfo?.id.toString()
                    );

                const mentionedTeamMember = otherTeamMembers?.find((id) => {
                    const username = this._getTeamMemberUsername(id);
                    return username && messageText?.includes(`@${username}`);
                });

                // If another team member is mentioned, clear our interest
                if (mentionedTeamMember) {
                    if (
                        hasInterest ||
                        this.interestChats[chatId]?.currentHandler ===
                            this.bot.botInfo?.id.toString()
                    ) {
                        delete this.interestChats[chatId];

                        // Only return if we're not the mentioned member
                        if (!isDirectlyMentioned) {
                            return;
                        }
                    }
                }

                // Set/maintain interest only if we're mentioned or already have interest
                if (isDirectlyMentioned) {
                    this.interestChats[chatId] = {
                        currentHandler: this.bot.botInfo?.id.toString(),
                        lastMessageSent: Date.now(),
                        messages: [],
                    };
                } else if (!isTeamRequest && !hasInterest) {
                    return;
                }

                // Update message tracking
                if (this.interestChats[chatId]) {
                    this.interestChats[chatId].messages.push({
                        userId: stringToUuid(ctx.from.id.toString()),
                        userName:
                            ctx.from.username ||
                            ctx.from.first_name ||
                            "Unknown User",
                        content: { text: messageText, source: "telegram" },
                    });

                    if (
                        this.interestChats[chatId].messages.length >
                        MESSAGE_CONSTANTS.MAX_MESSAGES
                    ) {
                        this.interestChats[chatId].messages = this.interestChats[
                            chatId
                        ].messages.slice(-MESSAGE_CONSTANTS.MAX_MESSAGES);
                    }
                }
            }

            try {
                // Convert IDs to UUIDs
                const userId = stringToUuid(ctx.from.id.toString()) as UUID;
                const chatId = stringToUuid(ctx.chat?.id.toString() + "-" + this.runtime.agentId) as UUID;
                const messageId = stringToUuid(message.message_id.toString() + "-" + this.runtime.agentId) as UUID;

                tgAgenticRagLogger.logDebug('Processing message with IDs:', {
                    userId,
                    chatId,
                    messageId,
                    agentId: this.runtime.agentId
                });

                // Get user name
                const userName =
                    ctx.from.username || ctx.from.first_name || "Unknown User";

                // Get agent ID
                const agentId = this.runtime.agentId;

                // Get room ID
                const roomId = chatId;

                // Ensure connection
                await this.runtime.ensureConnection(
                    userId,
                    roomId,
                    userName,
                    userName,
                    "telegram"
                );

                // Handle images
                const imageInfo = await this.processImage(message);

                // Get text or caption
                let messageText = "";
                if ("text" in message) {
                    messageText = message.text;
                } else if ("caption" in message && message.caption) {
                    messageText = message.caption;
                }

                // Combine text and image description
                const fullText = imageInfo
                    ? `${messageText} ${imageInfo.description}`
                    : messageText;

                if (!fullText) {
                    return; // Skip if no content
                }

                // Create content
                const content: Content = {
                    text: fullText,
                    source: "telegram",
                    inReplyTo:
                        "reply_to_message" in message && message.reply_to_message
                            ? stringToUuid(
                                  message.reply_to_message.message_id.toString() +
                                      "-" +
                                      this.runtime.agentId
                              )
                            : undefined,
                };

                // Create memory for the message
                const memory: Memory = {
                    id: messageId,
                    agentId,
                    userId,
                    roomId,
                    content,
                    createdAt: message.date * 1000,
                    embedding: getEmbeddingZeroVector(),
                };

                tgAgenticRagLogger.logInfo('Creating memory with details:', {
                    id: messageId,
                    createdAt: memory.createdAt,
                    timestamp: new Date(memory.createdAt || 0).toISOString()
                });

                // Create memory
                await this.runtime.messageManager.createMemory(memory);
                tgAgenticRagLogger.logInfo('Memory created successfully');

                // Log before composing state (composeState will getMemories -> recentMessagesData)
                tgAgenticRagLogger.logInfo('Composing state...');
                let state = await this.runtime.composeState(memory);
                state = await this.runtime.updateRecentMessageState(state);
                //elizaLogger.info('State composed:', { state.state.recentMessageInteractions });

                // Log before checking response
                tgAgenticRagLogger.logInfo('Checking if should respond...');
                const shouldRespond = await this._shouldRespond(message, state);
                tgAgenticRagLogger.logInfo('Should respond:', shouldRespond);

                if (shouldRespond) {
                    tgAgenticRagLogger.logInfo('Generating response...');
                    const context = composeContext({
                        state,
                        template: this.runtime.character.templates?.telegramMessageHandlerTemplate ||
                                 this.runtime.character?.templates?.messageHandlerTemplate ||
                                 telegramMessageHandlerTemplate,
                    });

                    const responseContent = await this._generateResponse(memory, state, context);
                    tgAgenticRagLogger.logInfo('Response generated:', { responseContent });

                    if (!responseContent || !responseContent.text) {
                        tgAgenticRagLogger.logWarn('No response content generated');
                        return;
                    }

                    // Send response in chunks
                    const callback: HandlerCallback = async (content: Content) => {
                        const sentMessages = await this.sendMessageInChunks(
                            ctx,
                            content,
                            message.message_id
                        );
                        const memories: Memory[] = [];
                        if (sentMessages) {
                            

                            // Create memories for each sent message
                            for (let i = 0; i < sentMessages.length; i++) {
                                const sentMessage = sentMessages[i];
                                const isLastMessage = i === sentMessages.length - 1;

                                const memory: Memory = {
                                    id: stringToUuid(
                                        sentMessage.message_id.toString() +
                                            "-" +
                                            this.runtime.agentId
                                    ),
                                    agentId,
                                    userId: agentId,
                                    roomId,
                                    content: {
                                        ...content,
                                        text: sentMessage.text,
                                        inReplyTo: messageId,
                                    },
                                    createdAt: sentMessage.date * 1000,
                                    embedding: getEmbeddingZeroVector(),
                                };

                                // Set action to CONTINUE for all messages except the last one
                                // For the last message, use the original action from the response content
                                memory.content.action = !isLastMessage
                                    ? "CONTINUE"
                                    : content.action;

                                await this.runtime.messageManager.createMemory(
                                    memory
                                );
                                memories.push(memory);
                            }

                            return memories;
                        } else {
                            return memories;
                        }
                    };

                    // Execute callback to send messages and log memories
                    const responseMessages = await callback(responseContent);

                    // Update state after response
                    state = await this.runtime.updateRecentMessageState(state);

                    // Handle any resulting actions
                    await this.runtime.processActions(
                        memory,
                        responseMessages,
                        state,
                        callback
                    );
                }

                await this.runtime.evaluate(memory, state, shouldRespond);
            } catch (innerError) {
                tgAgenticRagLogger.logError('Error in message processing:', {
                    error: {
                        name: (innerError as ExtendedError)?.name,
                        message: (innerError as ExtendedError)?.message,
                        stack: (innerError as ExtendedError)?.stack,
                        code: (innerError as ExtendedError)?.code,
                        details: (innerError as ExtendedError)?.details
                    },
                    context: {
                        chatId: ctx.chat?.id,
                        messageId: ctx.message?.message_id,
                        from: ctx.from?.username,
                        messageText: ctx.message && 'text' in ctx.message ? ctx.message.text : undefined
                    }
                });
                throw innerError;
            }

        } catch (error) {
            tgAgenticRagLogger.logError('❌ Error handling message:', {
                error: {
                    name: (error as ExtendedError)?.name,
                    message: (error as ExtendedError)?.message,
                    stack: (error as ExtendedError)?.stack,
                    code: (error as ExtendedError)?.code,
                    details: (error as ExtendedError)?.details
                },
                context: {
                    chatId: ctx.chat?.id,
                    messageId: ctx.message?.message_id,
                    from: ctx.from?.username,
                    messageText: ctx.message && 'text' in ctx.message ? ctx.message.text : undefined
                }
            });

            // Log raw error object
            tgAgenticRagLogger.logDebug('Raw error object:', error);

            // Try to stringify the full error
            try {
                tgAgenticRagLogger.logDebug('Stringified error:', JSON.stringify(error, Object.getOwnPropertyNames(error)));
            } catch (stringifyError) {
                tgAgenticRagLogger.logDebug('Could not stringify error:', stringifyError);
            }

            // Attempt to send error notification
            try {
                await ctx.reply('Sorry, there was an error processing your message. The team has been notified.');
            } catch (replyError) {
                tgAgenticRagLogger.logError('Failed to send error message:', {
                    error: replyError,
                    originalError: error,
                    chatId: ctx.chat?.id
                });
            }
        }
    }

}