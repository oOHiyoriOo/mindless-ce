
import { writeFileSync, readFileSync, mkdirSync, existsSync } from 'fs';
import { randomUUID } from 'crypto';
import { NPCData } from './npc/data.js';
import settings from '../../settings.js';
import { QdrantClient } from '@qdrant/js-client-rest';

export class History {
    constructor(agent) {
        this.agent = agent;
        this.name = agent.name;
        this.memory_fp = `./bots/${this.name}/memory.json`;
        this.full_history_fp = undefined;

        mkdirSync(`./bots/${this.name}/histories`, { recursive: true });

        this.turns = [];

        // Natural language memory as a summary of recent messages + previous memory
        this.memory = '';

        // Maximum number of messages to keep in context before saving chunk to memory
        this.max_messages = settings.max_messages;

        // Number of messages to remove from current history and save into memory
        this.summary_chunk_size = 5; 
        // chunking reduces expensive calls to promptMemSaving and appendFullHistory
        // and improves the quality of the memory summary

        // Qdrant client setup
        this.qdrantClient = null;
        this.qdrantReady = false;
        if (settings.use_qdrant_memory) {
            this.initQdrant();
        }
    }

    initQdrant() {
        if (this.qdrantReady) return;
        this.qdrantClient = new QdrantClient({
            url: settings.qdrant_url || 'http://localhost:6333',
            port: settings.qdrant_port || 6333,
        });
        this.qdrantReady = true;
    }

    getHistory() { // expects an Examples object
        return JSON.parse(JSON.stringify(this.turns));
    }

    // Query Qdrant for relevant memories given a context string
    async queryQdrantForRelevantMemories(context, top_k = 3) {
        if (!settings.use_qdrant_memory || !this.qdrantClient || !this.agent.prompter.embedding_model) return '';
        try {
            const queryEmbedding = await this.agent.prompter.embedding_model.embed(context);
            const result = await this.qdrantClient.search('bot_memories', {
                vector: queryEmbedding,
                limit: top_k,
                filter: {
                    must: [
                        { key: 'bot', match: { value: this.name } }
                    ]
                }
            });

            if (!result || !Array.isArray(result)) return '';
            // Sort by score descending, join memory payloads
            const memories = result
                .filter(r => r && r.payload && r.payload.memory)
                .sort((a, b) => (b.score || 0) - (a.score || 0))
                .map(r => r.payload.memory.trim())
                .filter(Boolean);

            console.log("================================================");
            console.log("Generated memories:", memories);
            console.log("================================================");

            return memories.join('\n');
        } catch (err) {
            console.error('Qdrant search failed:', err);
            return '';
        }
    }

    async summarizeMemories(turns) {
        console.log("Storing memories...");
        this.memory = await this.agent.prompter.promptMemSaving(turns);

        // Qdrant vector memory integration
        if (settings.use_qdrant_memory && this.agent.prompter.embedding_model) {
            if (!this.qdrantReady) await this.initQdrant();
            if (this.qdrantClient) {
                try {
                    // Use randomUUID for a valid Qdrant point ID
                    const embedding = await this.agent.prompter.embedding_model.embed(this.memory);
                    if (!embedding || !Array.isArray(embedding) || embedding.length === 0) {
                        console.warn('[Qdrant] Skipping upsert: embedding is empty or invalid. Original memory text:');
                        console.warn(this.memory);
                        return;
                    }
                    await this.qdrantClient.upsert('bot_memories', {
                        points: [
                            {
                                id: randomUUID(),
                                vector: embedding,
                                payload: {
                                    bot: this.name,
                                    memory: this.memory,
                                    timestamp: Date.now(),
                                },
                            },
                        ],
                    });
                    console.log('Memory upserted to Qdrant.');
                } catch (err) {
                    console.error('Qdrant upsert failed:', err);
                }
            }
        } else if (this.memory.length > 1024) {
            this.memory = this.memory.slice(0, 1024);
            this.memory += '...(Memory truncated to 1024 chars. Compress it more next time)';
        }

        console.log("Memory updated to: ", this.memory);
    }

    appendFullHistory(to_store) {
        if (this.full_history_fp === undefined) {
            const string_timestamp = new Date().toLocaleString().replace(/[/:]/g, '-').replace(/ /g, '').replace(/,/g, '_');
            this.full_history_fp = `./bots/${this.name}/histories/${string_timestamp}.json`;
            writeFileSync(this.full_history_fp, '[]', 'utf8');
        }
        try {
            const data = readFileSync(this.full_history_fp, 'utf8');
            let full_history = JSON.parse(data);
            full_history.push(...to_store);
            writeFileSync(this.full_history_fp, JSON.stringify(full_history, null, 4), 'utf8');
        } catch (err) {
            console.error(`Error reading ${this.name}'s full history file: ${err.message}`);
        }
    }

    async add(name, content, imagePath = null) {
        let role = 'assistant';
        if (name === 'system') {
            role = 'system';
        }
        else if (name !== this.name) {
            role = 'user';
            content = `${name}: ${content}`;
        }
        this.turns.push({role, content, imagePath});

        if (this.turns.length >= this.max_messages) {
            let chunk = this.turns.splice(0, this.summary_chunk_size);
            while (this.turns.length > 0 && this.turns[0].role === 'assistant')
                chunk.push(this.turns.shift()); // remove until turns starts with system/user message

            await this.summarizeMemories(chunk);
            this.appendFullHistory(chunk);
        }
    }

    save() {
        try {
            const data = {
                turns: this.turns,
                self_prompting_state: this.agent.self_prompter.state,
                self_prompt: this.agent.self_prompter.isStopped() ? null : this.agent.self_prompter.prompt,
                taskStart: this.agent.task.taskStartTime,
                last_sender: this.agent.last_sender
            };

            if(!settings.use_qdrant_memory){
                data.memory = this.memory;
            }

            writeFileSync(this.memory_fp, JSON.stringify(data, null, 2));
            console.log('Saved memory to:', this.memory_fp);
        } catch (error) {
            console.error('Failed to save history:', error);
            throw error;
        }
    }

    load() {
        try {
            if (!existsSync(this.memory_fp)) {
                console.log('No memory file found.');
                return null;
            }
            const data = JSON.parse(readFileSync(this.memory_fp, 'utf8'));
            if (!settings.use_qdrant_memory) {
                this.memory = data.memory || '';
            } else {
                this.memory = '';
            }
            this.turns = data.turns || [];
            console.log('Loaded memory:', this.memory);
            return data;
        } catch (error) {
            console.error('Failed to load history:', error);
            throw error;
        }
    }

    clear() {
        this.turns = [];
        this.memory = '';
    }
}