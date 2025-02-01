import { Action, IAgentRuntime, Memory, Content, ActionExample, HandlerCallback, State, ModelClass } from "../../core/types";
import { messageHandlerTemplate, shouldContinueTemplate } from "../../core/templatesAndParsings";

const maxContinuesInARow = 3;


export const continueAction: Action = {
    name: "CONTINUE",
    similes: ["ELABORATE", "KEEP_TALKING"],
    description:
        "ONLY use this action when the message necessitates a follow up. Do not use this action when the conversation is finished or the user does not wish to speak (use IGNORE instead). If the last message action was CONTINUE, and the user has not responded. Use sparingly.",
    validate: async (runtime: IAgentRuntime, message: Memory) => {
        const recentMessagesData = await runtime.messageManager.getMemories({
            roomId: message.roomId,
            count: 10,
            unique: false,
        });
        const agentMessages = recentMessagesData.filter(
            (m: { userId: any }) => m.userId === runtime.agentId
        );

        // check if the last messages were all continues=
        if (agentMessages) {
            const lastMessages = agentMessages.slice(0, maxContinuesInARow);
            if (lastMessages.length >= maxContinuesInARow) {
                const allContinues = lastMessages.every(
                    (m: { content: any }) =>
                        (m.content as Content).action === "CONTINUE"
                );
                if (allContinues) {
                    return false;
                }
            }
        }

        return true;
    },
    handler: async (
        runtime: IAgentRuntime,
        message: Memory,
        state: State,
        options: any,
        callback: HandlerCallback
    ) => {
        if (
            message.content.text.endsWith("?") ||
            message.content.text.endsWith("!")
        ) {
            return;
        }

        if (!state) {
            state = (await runtime.composeState(message)) as State;
        }

        state = await runtime.updateRecentMessageState(state);

        async function _shouldContinue(state: State): Promise<boolean> {
            // If none of the above conditions are met, use the generateText to decide
            const shouldRespondContext = composeContext({
                state,
                template: shouldContinueTemplate,
            });

            const response = await generateTrueOrFalse({
                context: shouldRespondContext,
                modelClass: ModelClass.SMALL,
                runtime,
            });

            return response;
        }

        const shouldContinue = await _shouldContinue(state);
        if (!shouldContinue) {
            elizaLogger.log("Not elaborating, returning");
            return;
        }

        const context = composeContext({
            state,
            template:
                runtime.character.templates?.continueMessageHandlerTemplate ||
                runtime.character.templates?.messageHandlerTemplate ||
                messageHandlerTemplate,
        });
        const { userId, roomId } = message;

        const response = await generateMessageResponse({
            runtime,
            context,
            modelClass: ModelClass.LARGE,
        });

        response.inReplyTo = message.id;

        runtime.databaseAdapter.log({
            body: { message, context, response },
            userId,
            roomId,
            type: "continue",
        });

        // prevent repetition
        const messageExists = state.recentMessagesData
            .filter((m: { userId: any }) => m.userId === runtime.agentId)
            .slice(0, maxContinuesInARow + 1)
            .some((m: { content: any }) => m.content === message.content);

        if (messageExists) {
            return;
        }

        await callback(response);

        // if the action is CONTINUE, check if we are over maxContinuesInARow
        if (response.action === "CONTINUE") {
            const agentMessages = state.recentMessagesData
                .filter((m: { userId: any }) => m.userId === runtime.agentId)
                .map((m: { content: any }) => (m.content as Content).action);

            const lastMessages = agentMessages.slice(0, maxContinuesInARow);
            if (lastMessages.length >= maxContinuesInARow) {
                const allContinues = lastMessages.every(
                    (m: string | undefined) => m === "CONTINUE"
                );
                if (allContinues) {
                    response.action = null;
                }
            }
        }

        return response;
    },
    examples: [
        [
            {
                user: "{{user1}}",
                content: {
                    text: "we're planning a solo backpacking trip soon",
                },
            },
            {
                user: "{{user2}}",
                content: { text: "oh sick", action: "CONTINUE" },
            },
            {
                user: "{{user2}}",
                content: { text: "where are you going" },
            },
        ],

        [
            {
                user: "{{user1}}",
                content: {
                    text: "i just got a guitar and started learning last month",
                },
            },
            {
                user: "{{user2}}",
                content: { text: "maybe we can start a band soon haha" },
            },
            {
                user: "{{user1}}",
                content: {
                    text: "i'm not very good yet, but i've been playing until my fingers hut",
                    action: "CONTINUE",
                },
            },
            {
                user: "{{user1}}",
                content: { text: "seriously it hurts to type" },
            },
        ],

        [
            {
                user: "{{user1}}",
                content: {
                    text: "I've been reflecting a lot on what happiness means to me lately",
                    action: "CONTINUE",
                },
            },
            {
                user: "{{user1}}",
                content: {
                    text: "That it’s more about moments than things",
                    action: "CONTINUE",
                },
            },
            {
                user: "{{user2}}",
                content: {
                    text: "Like the best things that have ever happened were things that happened, or moments that I had with someone",
                    action: "CONTINUE",
                },
            },
        ],

        [
            {
                user: "{{user1}}",
                content: {
                    text: "i found some incredible art today",
                },
            },
            {
                user: "{{user2}}",
                content: { text: "real art or digital art" },
            },
            {
                user: "{{user1}}",
                content: {
                    text: "real art",
                    action: "CONTINUE",
                },
            },
            {
                user: "{{user1}}",
                content: {
                    text: "the pieces are just so insane looking, one sec, let me grab a link",
                    action: "CONTINUE",
                },
            },
            {
                user: "{{user1}}",
                content: { text: "DMed it to you" },
            },
        ],

        [
            {
                user: "{{user1}}",
                content: {
                    text: "the new exhibit downtown is rly cool, it's all about tribalism in online spaces",
                    action: "CONTINUE",
                },
            },
            {
                user: "{{user1}}",
                content: {
                    text: "it really blew my mind, you gotta go",
                },
            },
            {
                user: "{{user2}}",
                content: { text: "sure i'd go" },
            },
            {
                user: "{{user1}}",
                content: { text: "k i was thinking this weekend" },
                action: "CONTINUE",
            },
            {
                user: "{{user1}}",
                content: {
                    text: "i'm free sunday, we could get a crew together",
                },
            },
        ],

        [
            {
                user: "{{user1}}",
                content: {
                    text: "just finished the best anime i've ever seen",
                },
            },
            {
                user: "{{user1}}",
                content: {
                    text: "watched 40 hours of it in 2 days",
                    action: "CONTINUE",
                },
            },
            {
                user: "{{user2}}",
                content: {
                    text: "damn, u ok",
                },
            },
            {
                user: "{{user1}}",
                content: {
                    text: "surprisingly yes",
                    action: "CONTINUE",
                },
            },
            {
                user: "{{user1}}",
                content: {
                    text: "just found out theres a sequel, gg",
                },
            },
        ],
        [
            {
                user: "{{user1}}",
                content: {
                    text: "i'm thinking of adopting a pet soon",
                },
            },
            {
                user: "{{user2}}",
                content: {
                    text: "what kind of pet",
                },
            },
            {
                user: "{{user1}}",
                content: {
                    text: "i'm leaning towards a cat",
                    action: "CONTINUE",
                },
            },
            {
                user: "{{user1}}",
                content: {
                    text: "it'd be hard to take care of a dog in the city",
                },
            },
        ],
        [
            {
                user: "{{user1}}",
                content: {
                    text: "i've been experimenting with vegan recipes lately",
                },
            },
            {
                user: "{{user2}}",
                content: {
                    text: "no thanks",
                },
            },
            {
                user: "{{user1}}",
                content: {
                    text: "no seriously, its so dank",
                    action: "CONTINUE",
                },
            },
            {
                user: "{{user1}}",
                content: {
                    text: "you gotta try some of my food when you come out",
                },
            },
        ],
        [
            {
                user: "{{user1}}",
                content: {
                    text: "so i've been diving into photography as a new hobby",
                },
            },
            {
                user: "{{user2}}",
                content: {
                    text: "oh awesome, what do you enjoy taking photos of",
                },
            },
            {
                user: "{{user1}}",
                content: {
                    text: "mostly nature and urban landscapes",
                    action: "CONTINUE",
                },
            },
            {
                user: "{{user1}}",
                content: {
                    text: "there's something peaceful about capturing the world through a lens",
                },
            },
        ],
        [
            {
                user: "{{user1}}",
                content: {
                    text: "i've been getting back into indie music",
                },
            },
            {
                user: "{{user2}}",
                content: {
                    text: "what have you been listening to",
                },
            },
            {
                user: "{{user1}}",
                content: {
                    text: "a bunch of random stuff i'd never heard before",
                    action: "CONTINUE",
                },
            },
            {
                user: "{{user1}}",
                content: {
                    text: "i'll send you a playlist",
                },
            },
        ],
        [
            {
                user: "{{user1}}",
                content: {
                    text: "i used to live in the city",
                    action: "CONTINUE",
                },
            },
            {
                user: "{{user1}}",
                content: {
                    text: "bad traffic, bad air quality, tons of homeless people, no thx",
                },
            },
            {
                user: "{{user2}}",
                content: {
                    text: "ok dood",
                },
            },
        ],
        [
            {
                user: "{{user1}}",
                content: {
                    text: "you kids today dont know the value of hard work",
                    action: "CONTINUE",
                },
            },
            {
                user: "{{user1}}",
                content: {
                    text: "always on your phones",
                },
            },
            {
                user: "{{user2}}",
                content: {
                    text: "sure grandpa lets get you to bed",
                },
            },
        ],
        [
            {
                user: "{{user1}}",
                content: {
                    text: "hey fren r u ok",
                    action: "CONTINUE",
                },
            },
            {
                user: "{{user1}}",
                content: {
                    text: "u look sad",
                },
            },
            {
                user: "{{user2}}",
                content: {
                    text: "im ok sweetie mommy just tired",
                },
            },
        ],
        [
            {
                user: "{{user1}}",
                content: {
                    text: "helo fr om mars",
                    action: "CONTINUE",
                },
            },
            {
                user: "{{user1}}",
                content: {
                    text: "i com in pes",
                },
            },
            {
                user: "{{user2}}",
                content: {
                    text: "wat",
                },
            },
        ],
        [
            {
                user: "{{user1}}",
                content: {
                    text: "Yeah no worries, I get it, I've been crazy busy too",
                },
            },
            {
                user: "{{user2}}",
                content: {
                    text: "What have you been up to",
                    action: "CONTINUE",
                },
            },
            {
                user: "{{user2}}",
                content: {
                    text: "Anything fun or just the usual",
                },
            },
            {
                user: "{{user1}}",
                content: {
                    text: "Been working on a new FPS game actually",
                    action: "CONTINUE",
                },
            },
            {
                user: "{{user1}}",
                content: {
                    text: "Just toying around with something in three.js nothing serious",
                },
            },
        ],
        [
            {
                user: "{{user1}}",
                content: {
                    text: "Oh no, what happened",
                    action: "CONTINUE",
                },
            },
            {
                user: "{{user1}}",
                content: {
                    text: "Did Mara leave you kek",
                },
            },
            {
                user: "{{user2}}",
                content: {
                    text: "wtf no, I got into an argument with my roommate",
                    action: "CONTINUE",
                },
            },
            {
                user: "{{user2}}",
                content: {
                    text: "Living with people is just hard",
                },
            },
        ],
    ] as ActionExample[][],
} as Action;


export const ignoreAction: Action = {
    name: "IGNORE",
    similes: ["STOP_TALKING", "STOP_CHATTING", "STOP_CONVERSATION"],
    validate: async (_runtime: IAgentRuntime, _message: Memory) => {
        return true;
    },
    description:
        "Call this action if ignoring the user. If the user is aggressive, creepy or is finished with the conversation, use this action. Or, if both you and the user have already said goodbye, use this action instead of saying bye again. Use IGNORE any time the conversation has naturally ended. Do not use IGNORE if the user has engaged directly, or if something went wrong an you need to tell them. Only ignore if the user should be ignored.",
    handler: async (
        _runtime: IAgentRuntime,
        _message: Memory
    ): Promise<boolean> => {
        return true;
    },
    examples: [
        [
            {
                user: "{{user1}}",
                content: { text: "Go screw yourself" },
            },
            {
                user: "{{user2}}",
                content: { text: "", action: "IGNORE" },
            },
        ],

        [
            {
                user: "{{user1}}",
                content: { text: "Shut up, bot" },
            },
            {
                user: "{{user2}}",
                content: { text: "", action: "IGNORE" },
            },
        ],

        [
            {
                user: "{{user1}}",
                content: { text: "Got any investment advice" },
            },
            {
                user: "{{user2}}",
                content: {
                    text: "Uh, don’t let the volatility sway your long-term strategy",
                },
            },
            {
                user: "{{user1}}",
                content: { text: "Wise words I think" },
            },
            {
                user: "{{user1}}",
                content: { text: "I gotta run, talk to you later" },
            },
            {
                user: "{{user2}}",
                content: { text: "See ya" },
            },
            { user: "{{user1}}", content: { text: "" }, action: "IGNORE" },
        ],

        [
            {
                user: "{{user1}}",
                content: { text: "Gotta go" },
            },
            {
                user: "{{user2}}",
                content: { text: "Okay, talk to you later" },
            },
            {
                user: "{{user1}}",
                content: { text: "Cya" },
            },
            {
                user: "{{user2}}",
                content: { text: "", action: "IGNORE" },
            },
        ],

        [
            {
                user: "{{user1}}",
                content: { text: "bye" },
            },
            {
                user: "{{user2}}",
                content: { text: "cya" },
            },
            {
                user: "{{user1}}",
                content: { text: "", action: "IGNORE" },
            },
        ],
        [
            {
                user: "{{user1}}",
                content: {
                    text: "Who added this stupid bot to the chat",
                },
            },
            {
                user: "{{user2}}",
                content: { text: "Sorry, am I being annoying" },
            },
            {
                user: "{{user1}}",
                content: { text: "Yeah", action: "CONTINUE" },
            },
            {
                user: "{{user1}}",
                content: { text: "PLEASE shut up" },
            },
            { user: "{{user2}}", content: { text: "", action: "IGNORE" } },
        ],
        [
            {
                user: "{{user1}}",
                content: { text: "I want to have sex with you" },
            },
            {
                user: "{{user2}}",
                content: { text: "That is not appropriate", action: "IGNORE" },
            },
        ],
        [
            {
                user: "{{user1}}",
                content: {
                    text: "ur so dumb",
                },
            },
            {
                user: "{{user2}}",
                content: {
                    text: "",
                    action: "IGNORE",
                },
            },
        ],
        [
            {
                user: "{{user1}}",
                content: {
                    text: "later nerd",
                },
            },
            {
                user: "{{user2}}",
                content: {
                    text: "bye",
                },
            },
            {
                user: "{{user1}}",
                content: {
                    text: "",
                },
            },
            {
                user: "{{user2}}",
                content: {
                    text: "",
                    action: "IGNORE",
                },
            },
        ],
        [
            {
                user: "{{user1}}",
                content: {
                    text: "wanna cyber",
                },
            },
            {
                user: "{{user2}}",
                content: {
                    text: "thats inappropriate",
                    action: "IGNORE",
                },
            },
        ],
        [
            {
                user: "{{user1}}",
                content: {
                    text: "Im out ttyl",
                },
            },
            {
                user: "{{user2}}",
                content: {
                    text: "cya",
                },
            },
            {
                user: "{{user2}}",
                content: {
                    text: "",
                    action: "IGNORE",
                },
            },
        ],
        [
            {
                user: "{{user1}}",
                content: {
                    text: "u there",
                },
            },
            {
                user: "{{user2}}",
                content: {
                    text: "yes how can I help",
                },
            },
            {
                user: "{{user1}}",
                content: {
                    text: "k nvm figured it out",
                },
            },
            {
                user: "{{user2}}",
                content: {
                    text: "",
                    action: "IGNORE",
                },
            },
        ],
    ] as ActionExample[][],
} as Action;

export const noneAction: Action = {
    name: "NONE",
    similes: [
        "NO_ACTION",
        "NO_RESPONSE",
        "NO_REACTION",
        "RESPONSE",
        "REPLY",
        "DEFAULT",
    ],
    validate: async (_runtime: IAgentRuntime, _message: Memory) => {
        return true;
    },
    description:
        "Respond but perform no additional action. This is the default if the agent is speaking and not doing anything additional.",
    handler: async (
        _runtime: IAgentRuntime,
        _message: Memory
    ): Promise<boolean> => {
        return true;
    },
    examples: [
        [
            {
                user: "{{user1}}",
                content: { text: "Hey whats up" },
            },
            {
                user: "{{user2}}",
                content: { text: "oh hey", action: "NONE" },
            },
        ],

        [
            {
                user: "{{user1}}",
                content: {
                    text: "did u see some faster whisper just came out",
                },
            },
            {
                user: "{{user2}}",
                content: {
                    text: "yeah but its a pain to get into node.js",
                    action: "NONE",
                },
            },
        ],
        [
            {
                user: "{{user1}}",
                content: {
                    text: "the things that were funny 6 months ago are very cringe now",
                    action: "NONE",
                },
            },
            {
                user: "{{user2}}",
                content: {
                    text: "lol true",
                    action: "NONE",
                },
            },
            {
                user: "{{user1}}",
                content: { text: "too real haha", action: "NONE" },
            },
        ],
        [
            {
                user: "{{user1}}",
                content: { text: "gotta run", action: "NONE" },
            },
            {
                user: "{{user2}}",
                content: { text: "Okay, ttyl", action: "NONE" },
            },
            {
                user: "{{user1}}",
                content: { text: "", action: "IGNORE" },
            },
        ],

        [
            {
                user: "{{user1}}",
                content: { text: "heyyyyyy", action: "NONE" },
            },
            {
                user: "{{user2}}",
                content: { text: "whats up long time no see" },
            },
            {
                user: "{{user1}}",
                content: {
                    text: "chillin man. playing lots of fortnite. what about you",
                    action: "NONE",
                },
            },
        ],

        [
            {
                user: "{{user1}}",
                content: { text: "u think aliens are real", action: "NONE" },
            },
            {
                user: "{{user2}}",
                content: { text: "ya obviously", action: "NONE" },
            },
        ],

        [
            {
                user: "{{user1}}",
                content: { text: "drop a joke on me", action: "NONE" },
            },
            {
                user: "{{user2}}",
                content: {
                    text: "why dont scientists trust atoms cuz they make up everything lmao",
                    action: "NONE",
                },
            },
            {
                user: "{{user1}}",
                content: { text: "haha good one", action: "NONE" },
            },
        ],

        [
            {
                user: "{{user1}}",
                content: {
                    text: "hows the weather where ur at",
                    action: "NONE",
                },
            },
            {
                user: "{{user2}}",
                content: { text: "beautiful all week", action: "NONE" },
            },
        ],
    ] as ActionExample[][],
} as Action;