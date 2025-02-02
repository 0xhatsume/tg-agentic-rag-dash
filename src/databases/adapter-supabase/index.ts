import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
    type Memory,
    type Goal,
    type Relationship,
    Actor,
    GoalStatus,
    Account,
    type UUID,
    Participant,
    Room,
} from "../../core/types";
import { DatabaseAdapter } from "../index";
import { getEmbeddingZeroVector, getEmbeddingConfig } from "../../core/embedding";
import { tgAgenticRagLogger } from "../../logger";
import { v4 as uuid } from "uuid";


export class SupabaseDatabaseAdapter extends DatabaseAdapter {
    async getRoom(roomId: UUID): Promise<UUID | null> {
        const { data, error } = await this.supabase
            .from("rooms")
            .select("id")
            .eq("id", roomId);
            //.single();

        if (error) {
            throw new Error(`Error getting room: ${error.message}`);
        }

        return data && data.length > 0 ? (data[0].id as UUID) : null;
    }

    async getParticipantsForAccount(userId: UUID): Promise<Participant[]> {
        const { data, error } = await this.supabase
            .from("participants")
            .select("*")
            .eq("userId", userId);

        if (error) {
            throw new Error(
                `Error getting participants for account: ${error.message}`
            );
        }

        return data as Participant[];
    }

    async getParticipantUserState(
        roomId: UUID,
        userId: UUID
    ): Promise<"FOLLOWED" | "MUTED" | null> {
        const { data, error } = await this.supabase
            .from("participants")
            .select("userState")
            .eq("roomId", roomId)
            .eq("userId", userId)
            .single();

        if (error) {
            console.error("Error getting participant user state:", error);
            return null;
        }

        return data?.userState as "FOLLOWED" | "MUTED" | null;
    }

    async setParticipantUserState(
        roomId: UUID,
        userId: UUID,
        state: "FOLLOWED" | "MUTED" | null
    ): Promise<void> {
        const { error } = await this.supabase
            .from("participants")
            .update({ userState: state })
            .eq("roomId", roomId)
            .eq("userId", userId);

        if (error) {
            console.error("Error setting participant user state:", error);
            throw new Error("Failed to set participant user state");
        }
    }

    async getParticipantsForRoom(roomId: UUID): Promise<UUID[]> {
        const { data, error } = await this.supabase
            .from("participants")
            .select("userId")
            .eq("roomId", roomId);

        if (error) {
            throw new Error(
                `Error getting participants for room: ${error.message}`
            );
        }

        return data.map((row) => row.userId as UUID);
    }

    supabase: SupabaseClient;

    constructor(supabaseUrl: string, supabaseKey: string) {
        super();
        this.supabase = createClient(supabaseUrl, supabaseKey);
    }

    async init() {
        // noop
        tgAgenticRagLogger.logDebug('initializing supabase adapter...');
    }

    async close() {
        // noop
    }

    async getMemoriesByRoomIds(params: {
        agentId: UUID;
        roomIds: UUID[];
        tableName: string;
    }): Promise<Memory[]> {
        try {
            // Early return for 'facts' table requests
            if (params.tableName === 'facts') {
                tgAgenticRagLogger.logDebug('Facts table requested, returning empty array');
                return [];
            }

            // Get the embedding config to determine the correct table suffix
            const config = getEmbeddingConfig();

            // Map legacy table names to dimensionally-correct tables
            const tableMap: { [key: string]: string } = {
                'messages': `memories_${config.dimensions}`,
                'memories': `memories_${config.dimensions}`,
                'fragments': `memories_${config.dimensions}`
            };

            // Use mapped table name or default to memories_{dimension}
            const tableName = params.tableName ? tableMap[params.tableName] || params.tableName : `memories_${config.dimensions}`;

            tgAgenticRagLogger.logDebug(`Getting memories by room IDs from table ${tableName}`, {
                roomIds: params.roomIds,
                agentId: params.agentId,
                originalTable: params.tableName,
                embeddingDimensions: config.dimensions
            });

            let query = this.supabase
                .from(tableName)
                .select("*")
                .in("roomId", params.roomIds);

            if (params.agentId) {
                query = query.eq("agentId", params.agentId);
            }

            const { data, error } = await query;

            if (error) {
                tgAgenticRagLogger.logError('Error retrieving memories by room IDs:', {
                    error,
                    params,
                    tableName,
                    originalTable: params.tableName
                });
                return [];
            }

            // map createdAt to Date and parse content if needed
            const memories = data.map((memory) => ({
                ...memory,
                content: typeof memory.content === 'string'
                    ? JSON.parse(memory.content)
                    : memory.content
            }));

            tgAgenticRagLogger.logDebug(`Found ${memories.length} memories in ${tableName}`);
            return memories as Memory[];
        } catch (error) {
            tgAgenticRagLogger.logError('Exception in getMemoriesByRoomIds:', {
                error,
                params,
                tableName: params.tableName
            });
            return [];
        }
    }

    async getAccountById(userId: UUID): Promise<Account | null> {
        const { data, error } = await this.supabase
            .from("accounts")
            .select("*")
            .eq("id", userId)
            .single();

        if (error) {
            if (error.code === 'PGRST116') { // No rows found
                return null;
            }
            throw new Error(error.message);
        }

        if (data && typeof data.details === "string") {
            data.details = JSON.parse(data.details);
        }

        return data as Account;
    }

    async createAccount(account: Account): Promise<boolean> {
        try {
            const accountData = {
                ...account,
                id: account.id ?? uuid(),
                details: typeof account.details === 'string'
                    ? account.details
                    : JSON.stringify(account.details)
            };

            const { error } = await this.supabase
                .from("accounts")
                .upsert([accountData]);

            if (error) {
                console.error("Error creating account:", error.message);
                return false;
            }
            return true;
        } catch (error) {
            console.error("Error creating account:", error);
            return false;
        }
    }

    async getActorDetails(params: { roomId: UUID }): Promise<Actor[]> {
        try {
            const response = await this.supabase
                .from("participants")
                .select(`
                    account:accounts(id, name, username, details)
                `)
                .eq("roomId", params.roomId);

            if (response.error) {
                console.error("Error getting actor details:", response.error);
                return [];
            }

            return response.data
                .map(participant => {
                    const user = participant.account as unknown as Actor;
                    if (!user) return null;

                    return {
                        name: user.name,
                        details: typeof user.details === 'string'
                            ? JSON.parse(user.details)
                            : user.details,
                        id: user.id,
                        username: user.username,
                    };
                })
                .filter((actor): actor is Actor => actor !== null);
        } catch (error) {
            console.error("Error in getActorDetails:", error);
            return [];
        }
    }

    async searchMemories(params: {
        tableName: string;
        roomId: UUID;
        agentId?: UUID;
        embedding: number[];
        match_threshold: number;
        match_count: number;
        unique: boolean;
    }): Promise<Memory[]> {
        tgAgenticRagLogger.logDebug('searching similar memories ...');
        try {
            // Skip search if no embedding is provided
            if (!params.embedding || params.embedding.length === 0) {
                tgAgenticRagLogger.logDebug('Skipping memory search - no embedding provided');
                return [];
            }

            // Get the embedding config to determine the correct table suffix
            const config = getEmbeddingConfig();

            // Map legacy table names to dimensionally-correct tables
            const tableMap: { [key: string]: string } = {
                'messages': `memories_${config.dimensions}`,
                'memories': `memories_${config.dimensions}`,
                'fragments': `memories_${config.dimensions}`
            };

            // Use mapped table name or default to memories_{dimension}
            const tableName = params.tableName ? tableMap[params.tableName] || params.tableName : `memories_${config.dimensions}`;

            const result = await this.supabase.rpc("search_memories", {
                query_embedding: params.embedding,
                query_match_threshold: params.match_threshold,
                query_match_count: params.match_count,
                query_table_name: tableName,
                query_type: params.tableName,
                query_roomid: params.roomId,
                query_agentid: params.agentId,
                query_unique: params.unique
            });

            if (result.error) {
                tgAgenticRagLogger.logError('Error in searchMemories:', {
                    error: result.error,
                    params
                });
                return [];
            }

            tgAgenticRagLogger.logDebug('Found memories in searchMemories:', {
                count: result.data?.length || 0,
                memories: result.data?.map(memory => ({
                    id: memory.id,
                    createdAt: memory.createdAt
                }))
            });

            // Transform results to match Memory type
            return (result.data || []).map(memory => ({
                ...memory,
                createdAt: typeof memory.createdAt === "string"
                    ? Date.parse(memory.createdAt)
                    : memory.createdAt,
                content: typeof memory.content === "string"
                    ? JSON.parse(memory.content)
                    : memory.content
            }));
        } catch (error) {
            tgAgenticRagLogger.logError('Exception in searchMemories:', {
                error: error instanceof Error ? error.message : String(error),
                params
            });
            return [];
        }
    }

    async getCachedEmbeddings(opts: {
        query_table_name: string;
        query_threshold: number;
        query_input: string;
        query_field_name: string;
        query_field_sub_name: string;
        query_match_count: number;
    }): Promise<{ embedding: number[]; levenshtein_score: number; }[]> {
        try {
            // Early return for 'facts' table requests
            if (opts.query_table_name === 'facts') {
                tgAgenticRagLogger.logDebug('Facts table requested, returning empty array');
                return [];
            }

            tgAgenticRagLogger.logDebug('Getting cached embeddings with params:', opts);

            // Get the embedding config to determine the correct table suffix
            const config = getEmbeddingConfig();

            // Map legacy table names to new ones
            const tableMap: { [key: string]: string } = {
                'messages': `memories_${config.dimensions}`,
                'memories': `memories_${config.dimensions}`,
                'fragments': `memories_${config.dimensions}`
            };

            // Use mapped table name or default to memories_{dimension}
            const tableName = tableMap[opts.query_table_name] || opts.query_table_name || `memories_${config.dimensions}`;

            tgAgenticRagLogger.logDebug(`Using table: ${tableName} (original: ${opts.query_table_name})`);

            const result = await this.supabase.rpc("get_embedding_list", {
                ...opts,
                query_table_name: tableName
            });

            if (result.error) {
                tgAgenticRagLogger.logError('Error getting cached embeddings:', {
                    error: result.error,
                    opts,
                    tableName,
                    originalTable: opts.query_table_name
                });
                return [];
            }

            tgAgenticRagLogger.logDebug(`Found ${result.data?.length || 0} cached embeddings`);
            return result.data || [];
        } catch (error) {
            tgAgenticRagLogger.logError('Exception in getCachedEmbeddings:', {
                error,
                params: opts,
                tableName: opts.query_table_name
            });
            return [];
        }
    }

    async updateGoalStatus(params: {
        goalId: UUID;
        status: GoalStatus;
    }): Promise<void> {
        await this.supabase
            .from("goals")
            .update({ status: params.status })
            .match({ id: params.goalId });
    }

    async log(params: {
        body: { [key: string]: unknown };
        userId: UUID;
        roomId: UUID;
        type: string;
    }): Promise<void> {
        const { error } = await this.supabase.from("logs").insert({
            body: params.body,
            userId: params.userId,
            roomId: params.roomId,
            type: params.type,
        });

        if (error) {
            console.error("Error inserting log:", error);
            throw new Error(error.message);
        }
    }

    async getMemories(params: {
        roomId: UUID;
        count?: number;
        unique?: boolean;
        tableName?: string;
        agentId?: UUID;
        start?: number;
        end?: number;
    }): Promise<Memory[]> {
        tgAgenticRagLogger.logInfo('getMemories params:', params);
        try {
            // Early return for 'facts' table requests
            if (params.tableName === 'facts') {
                tgAgenticRagLogger.logDebug('Facts table requested, returning empty array');
                return [];
            }

            // Get the embedding config to determine the correct table suffix
            const config = getEmbeddingConfig();

            // Map legacy table names to dimensionally-correct tables
            const tableMap: { [key: string]: string } = {
                'messages': `memories_${config.dimensions}`,
                'fragments': `memories_${config.dimensions}`,
                'memories': `memories_${config.dimensions}`
            };

            // Use mapped table name or default to memories_{dimension}
            const tableName = params.tableName ? tableMap[params.tableName] || params.tableName : `memories_${config.dimensions}`;

            const { data, error } = await this.supabase
                .from(tableName)
                .select('*')
                .eq('roomId', params.roomId)
                .eq('type', params.tableName)
                .order('createdAt', { ascending: false })
                .limit(params.count || 10);

            if (error) {
                // Log but don't throw for expected cases
                if (error.message.includes('does not exist')) {
                    tgAgenticRagLogger.logInfo(`Table ${params.tableName} does not exist, returning empty array`);
                    return [];
                }

                tgAgenticRagLogger.logError('Error retrieving memories:', {
                    error,
                    params,
                    tableName: params.tableName
                });
                throw error;
            }

            // Log memories in a cleaner format
            if (data && data.length > 0) {
                tgAgenticRagLogger.logInfo('Memories retrieved.', 'Count:', data.length,
                    'data:',
                    {
                        memories: data.map(memory => ({
                            id: memory.id,
                            createdAt: memory.createdAt
                        }))
                    }
                )
            }

            return data || [];
        } catch (error) {
            // Handle unexpected errors gracefully
            tgAgenticRagLogger.logWarn('Exception in getMemories:', {
                error,
                params,
                tableName: params.tableName
            });
            return [];
        }
    }

    async searchMemoriesByEmbedding(
        embedding: number[],
        params: {
            match_threshold?: number;
            count?: number;
            roomId?: UUID;
            agentId?: UUID;
            unique?: boolean;
            tableName: string;
        }
    ): Promise<Memory[]> {
        const queryParams = {
            query_table_name: params.tableName,
            query_roomId: params.roomId,
            query_embedding: embedding,
            query_match_threshold: params.match_threshold,
            query_match_count: params.count,
            query_unique: !!params.unique,
        };
        if (params.agentId) {
            (queryParams as any).query_agentId = params.agentId;
        }

        const result = await this.supabase.rpc("search_memories", queryParams);
        if (result.error) {
            throw new Error(JSON.stringify(result.error));
        }
        return result.data.map((memory) => ({
            ...memory,
        }));
    }

    async getMemoryById(id: UUID | undefined): Promise<Memory | null> {
        // Add validation
        if (!id) {
            tgAgenticRagLogger.logDebug('Skipping memory lookup - no ID provided');
            return null;
        }

        try {
            const { data, error } = await this.supabase
                .from('memories')
                .select('*')
                .eq('id', id)
                .single();

            if (error) {
                tgAgenticRagLogger.logDebug('Memory not found:', { id, error: error.message });
                return null;
            }

            return data;
        } catch (error) {
            tgAgenticRagLogger.logWarn('Error retrieving memory by ID:', { id, error });
            return null;
        }
    }

    async createMemory(memory: Memory, tableName?: string): Promise<void> {
        try {
            // Validate embedding input
            if (!memory.content?.text || memory.content.text.trim().length === 0) {
                tgAgenticRagLogger.logDebug('Skipping empty content memory creation');
                return;
            }

            // Get the embedding config to determine the correct table suffix
            const config = getEmbeddingConfig();
            const tableMap: { [key: string]: string } = {
                'messages': `memories_${config.dimensions}`,
                'memories': `memories_${config.dimensions}`,
                'fragments': `memories_${config.dimensions}`
            };
            const resolvedTableName = tableMap[tableName || ''] || `memories_${config.dimensions}`;

            let isUnique = true;
            if (memory.embedding) {
                // Check similarity using searchMemories (like SQLite)
                const similarMemories = await this.searchMemories({
                    tableName: resolvedTableName,
                    roomId: memory.roomId,
                    agentId: memory.agentId,
                    embedding: memory.embedding,
                    match_threshold: 0.95,
                    match_count: 1,
                    unique: true
                });
                isUnique = similarMemories.length === 0;
            }

            const { error } = await this.supabase
                .from(resolvedTableName)
                .insert({
                    id: memory.id ?? uuid(),
                    type: tableName,
                    content: memory.content,
                    embedding: memory.embedding,
                    userId: memory.userId,
                    roomId: memory.roomId,
                    agentId: memory.agentId,
                    unique: isUnique
                });

            if (error) {
                tgAgenticRagLogger.logError('Error creating memory:', {
                    error,
                    content: memory.content.text
                });
                throw error;
            }

            tgAgenticRagLogger.logInfo('Memory created:', {
                content: memory.content.text,
                unique: isUnique
            });

        } catch (error) {
            tgAgenticRagLogger.logError('Exception in createMemory:', {
                error,
                content: memory.content.text
            });
            throw error;
        }
    }

    async removeMemory(memoryId: UUID): Promise<void> {
        const result = await this.supabase
            .from("memories")
            .delete()
            .eq("id", memoryId);
        const { error } = result;
        if (error) {
            throw new Error(JSON.stringify(error));
        }
    }

    async removeAllMemories(roomId: UUID, tableName: string): Promise<void> {
        const result = await this.supabase.rpc("remove_memories", {
            query_table_name: tableName,
            query_roomId: roomId,
        });

        if (result.error) {
            throw new Error(JSON.stringify(result.error));
        }
    }

    async countMemories(
        roomId: UUID,
        unique: boolean = true,
        tableName: string = ""
    ): Promise<number> {
        try {
            if (!tableName) {
                throw new Error("tableName is required");
            }

            const config = getEmbeddingConfig();
            const tableMap: { [key: string]: string } = {
                'messages': `memories_${config.dimensions}`,
                'memories': `memories_${config.dimensions}`,
                'fragments': `memories_${config.dimensions}`
            };
            const resolvedTableName = tableMap[tableName] || `memories_${config.dimensions}`;

            tgAgenticRagLogger.logDebug('Counting memories with params:', {
                roomId,
                unique,
                tableName: resolvedTableName
            });

            const result = await this.supabase.rpc("count_memories", {
                query_roomid: roomId,  // lowercase 'id' here
                query_table_name: resolvedTableName,
                query_unique: unique
            });

            if (result.error) {
                tgAgenticRagLogger.logError('Error counting memories:', {
                    error: result.error,
                    roomId,
                    tableName: resolvedTableName
                });
                throw result.error;
            }

            tgAgenticRagLogger.logDebug('Count result:', {
                count: result.data,
                tableName: resolvedTableName
            });

            return result.data || 0;
        } catch (error) {
            tgAgenticRagLogger.logError('Exception in countMemories:', {
                error: error instanceof Error ? error.message : String(error),
                roomId,
                tableName
            });
            throw error;
        }
    }

    async getGoals(params: {
        roomId: UUID;
        userId?: UUID | null;
        onlyInProgress?: boolean;
        count?: number;
    }): Promise<Goal[]> {
        try {
            tgAgenticRagLogger.logDebug('Getting goals with params:', params);

            const opts = {
                only_in_progress: params.onlyInProgress ?? false,
                query_roomid: params.roomId,
                query_userid: params.userId,
                row_count: params.count
            };

            const { data: goals, error } = await this.supabase.rpc(
                "get_goals",
                opts
            );

            if (error) {
                tgAgenticRagLogger.logError('Error fetching goals:', {
                    error,
                    params,
                    opts
                });
                throw new Error(error.message);
            }

            tgAgenticRagLogger.logDebug(`Found ${goals?.length || 0} goals`);
            return goals || [];
        } catch (error) {
            tgAgenticRagLogger.logError('Exception in getGoals:', {
                error,
                params
            });
            return [];
        }
    }

    async updateGoal(goal: Goal): Promise<void> {
        const { error } = await this.supabase
            .from("goals")
            .update(goal)
            .match({ id: goal.id });
        if (error) {
            throw new Error(`Error creating goal: ${error.message}`);
        }
    }

    async createGoal(goal: Goal): Promise<void> {
        const { error } = await this.supabase.from("goals").insert(goal);
        if (error) {
            throw new Error(`Error creating goal: ${error.message}`);
        }
    }

    async removeGoal(goalId: UUID): Promise<void> {
        const { error } = await this.supabase
            .from("goals")
            .delete()
            .eq("id", goalId);
        if (error) {
            throw new Error(`Error removing goal: ${error.message}`);
        }
    }

    async removeAllGoals(roomId: UUID): Promise<void> {
        const { error } = await this.supabase
            .from("goals")
            .delete()
            .eq("roomId", roomId);
        if (error) {
            throw new Error(`Error removing goals: ${error.message}`);
        }
    }

    async getRoomsForParticipant(userId: UUID): Promise<UUID[]> {
        const { data, error } = await this.supabase
            .from("participants")
            .select("roomId")
            .eq("userId", userId);

        if (error) {
            throw new Error(
                `Error getting rooms by participant: ${error.message}`
            );
        }

        return data.map((row) => row.roomId as UUID);
    }

    async getRoomsForParticipants(userIds: UUID[]): Promise<UUID[]> {
        const { data, error } = await this.supabase
            .from("participants")
            .select("roomId")
            .in("userId", userIds);

        if (error) {
            throw new Error(
                `Error getting rooms by participants: ${error.message}`
            );
        }

        return [...new Set(data.map((row) => row.roomId as UUID))] as UUID[];
    }

    async createRoom(roomId?: UUID): Promise<UUID> {
        roomId = roomId ?? (uuid() as UUID);

        const { data, error } = await this.supabase
            .from("rooms")
            .insert({ id: roomId })
            .select()
            .single();

        if (error) {
            throw new Error(`Error creating room: ${error.message}`);
        }

        if (!data) {
            throw new Error("No data returned from room creation");
        }

        return data.id as UUID;
    }

    async removeRoom(roomId: UUID): Promise<void> {
        const { error } = await this.supabase
            .from("rooms")
            .delete()
            .eq("id", roomId);

        if (error) {
            throw new Error(`Error removing room: ${error.message}`);
        }
    }

    async addParticipant(userId: UUID, roomId: UUID): Promise<boolean> {
        try {
            tgAgenticRagLogger.logDebug(`Adding participant - userId: ${userId}, roomId: ${roomId}`);

            const participantId = uuid() as UUID; // Generate new UUID for participant

            const { error } = await this.supabase
                .from("participants")
                .insert({
                    id: participantId,  // Add the generated ID
                    userId: userId,
                    roomId: roomId,
                    createdAt: new Date().toISOString()
                });

            if (error) {
                tgAgenticRagLogger.logError(`Error adding participant:`, {
                    error: error,
                    stack: (error as Error).stack,
                    userId: userId,
                    roomId: roomId
                });
                return false;
            }

            tgAgenticRagLogger.logDebug(`Successfully added participant ${participantId}`);
            return true;
        } catch (error) {
            tgAgenticRagLogger.logError(`Exception in addParticipant:`, {
                error: error,
                stack: (error as Error).stack,
                userId: userId,
                roomId: roomId
            });
            return false;
        }
    }

    async removeParticipant(userId: UUID, roomId: UUID): Promise<boolean> {
        const { error } = await this.supabase
            .from("participants")
            .delete()
            .eq("userId", userId)
            .eq("roomId", roomId);

        if (error) {
            console.error(`Error removing participant: ${error.message}`);
            return false;
        }
        return true;
    }

    async createRelationship(params: {
        userA: UUID;
        userB: UUID;
    }): Promise<boolean> {
        const allRoomData = await this.getRoomsForParticipants([
            params.userA,
            params.userB,
        ]);

        let roomId: UUID;

        if (!allRoomData || allRoomData.length === 0) {
            // If no existing room is found, create a new room
            const { data: newRoomData, error: roomsError } = await this.supabase
                .from("rooms")
                .insert({})
                .single();

            if (roomsError) {
                throw new Error("Room creation error: " + roomsError.message);
            }

            roomId = (newRoomData as Room)?.id as UUID;
        } else {
            // If an existing room is found, use the first room's ID
            roomId = allRoomData[0];
        }

        const { error: participantsError } = await this.supabase
            .from("participants")
            .insert([
                { userId: params.userA, roomId },
                { userId: params.userB, roomId },
            ]);

        if (participantsError) {
            throw new Error(
                "Participants creation error: " + participantsError.message
            );
        }

        // Create or update the relationship between the two users
        const { error: relationshipError } = await this.supabase
            .from("relationships")
            .upsert({
                userA: params.userA,
                userB: params.userB,
                userId: params.userA,
                status: "FRIENDS",
            })
            .eq("userA", params.userA)
            .eq("userB", params.userB);

        if (relationshipError) {
            throw new Error(
                "Relationship creation error: " + relationshipError.message
            );
        }

        return true;
    }

    async getRelationship(params: {
        userA: UUID;
        userB: UUID;
    }): Promise<Relationship | null> {
        const { data, error } = await this.supabase.rpc("get_relationship", {
            usera: params.userA,
            userb: params.userB,
        });

        if (error) {
            throw new Error(error.message);
        }

        return data[0];
    }

    async getRelationships(params: { userId: UUID }): Promise<Relationship[]> {
        const { data, error } = await this.supabase
            .from("relationships")
            .select("*")
            .or(`userA.eq.${params.userId},userB.eq.${params.userId}`)
            .eq("status", "FRIENDS");

        if (error) {
            throw new Error(error.message);
        }

        return data as Relationship[];
    }
}
