import { IAgentRuntime, Character, IDatabaseAdapter, ICacheManager } from "./types";
import { AgentRuntime } from "./runtime";
import { tgAgenticRagLogger } from "../logger";
import { bootstrapPlugin } from "../plugins/plugin-bootstrap";


const logFetch = async (url: string, options: any) => {
    tgAgenticRagLogger.logDebug(`Fetching ${url}`);
    // Disabled to avoid disclosure of sensitive information such as API keys
    // elizaLogger.debug(JSON.stringify(options, null, 2));
    return fetch(url, options);
};

export async function createAgent(
    character: Character,
    db: IDatabaseAdapter,
    cache: ICacheManager,
    token: string
): Promise<AgentRuntime> {
    tgAgenticRagLogger.logSuccess(
        "Success",
        "Creating runtime for character",
        character.name
    );

    //nodePlugin ??= createNodePlugin();

    return new AgentRuntime({
        databaseAdapter: db,
        token,
        modelProvider: character.modelProvider,
        evaluators: [],
        character,
        // character.plugins are handled when clients are added
        plugins: [
            bootstrapPlugin,
            //nodePlugin, // all the services. Do later.
        ].filter(Boolean),
        providers: [],
        actions: [],
        services: [],
        managers: [],
        cacheManager: cache,
        fetch: logFetch,
    });
}