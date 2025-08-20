import { AgentProcess } from './src/process/agent_process.js';
import settings from './settings.js';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import process from 'process';
import { createMindServer } from './src/server/mind_server.js';
import { mainProxy } from './src/process/main_proxy.js';
import { readFileSync, writeFileSync } from 'fs';
import { initSTT } from './src/process/stt_process.js';
import { setupLogConsent } from './logger.js';

function parseArguments() {
    return yargs(hideBin(process.argv))
        .option('profiles', {
            type: 'array',
            describe: 'List of agent profile paths',
        })
        .option('task_path', {
            type: 'string',
            describe: 'Path to task file to execute'
        })
        .option('task_id', {
            type: 'string',
            describe: 'Task ID to execute'
        })
        .help()
        .alias('help', 'h')
        .parse();
}

function getProfiles(args) {
    return args.profiles || settings.profiles;
}

async function main() {
    await new Promise(resolve => setTimeout(resolve, 1000));
    // wait for 1 second to ensure other modules are ready, avoiding cluttering the stdout and confusing the user.
    await setupLogConsent();
    if (settings.host_mindserver) {
        const mindServer = createMindServer(settings.mindserver_port);
    }
    mainProxy.connect();

    // Qdrant collection creation if enabled
    if (settings.use_qdrant_memory) {
        try {
            const { QdrantClient } = await import('@qdrant/js-client-rest');
            const qdrantClient = new QdrantClient({
                url: settings.qdrant_url || 'http://localhost:6333',
                port: settings.qdrant_port || 6333,
            });
            // Use a dummy vector to get the size (fallback to 1536 if unknown)
            let vectorSize = 1536;
            if (settings.embedding_model && settings.embedding_model.vector_size) {
                vectorSize = settings.embedding_model.vector_size;
            }
            // Try both formats for compatibility
            let created = false;
            try {
                await qdrantClient.createCollection('bot_memories', {
                    vectors: {
                        size: vectorSize,
                        distance: 'Cosine',
                    }
                });
                created = true;
                console.log('Qdrant collection created (format 1)');
            } catch (err) {
                if (err?.data?.status?.error && err.data.status.error.includes('VectorsConfig')) {
                    try {
                        await qdrantClient.createCollection('bot_memories', {
                            vectors: {
                                default: {
                                    size: vectorSize,
                                    distance: 'Cosine',
                                }
                            }
                        });
                        created = true;
                        console.log('Qdrant collection created (format 2)');
                    } catch (err2) {
                        if (err2?.data?.status?.error && err2.data.status.error.includes('already exists')) {
                            console.log('Qdrant collection already exists.');
                        } else {
                            throw err2;
                        }
                    }
                } else if (err?.data?.status?.error && err.data.status.error.includes('already exists')) {
                    console.log('Qdrant collection already exists.');
                } else {
                    throw err;
                }
            }
        } catch (err) {
            console.error('Failed to create Qdrant collection:', err);
        }
    }

    const args = parseArguments();
    const profiles = getProfiles(args);
    console.log(profiles);
    const { load_memory, init_message } = settings;

    if (process.env.AGENT_NAME && profiles.length === 1) {
        const profilePath = profiles[0];
        try {
            let profileContent = readFileSync(profilePath, 'utf8');
            let agent_json = JSON.parse(profileContent);

            const newName = process.env.AGENT_NAME;
            // replace "{agent_json.name}" with the new name from the file directly without json stuff
            profileContent = profileContent.replace(agent_json.name, newName);
            // now update the file
            // Update the name property directly and write the updated JSON back to the file
            agent_json.name = newName;
            const updatedProfileContent = JSON.stringify(agent_json, null, 2);
            writeFileSync(profilePath, updatedProfileContent, 'utf8');
        } catch (e) {
            console.error(`Failed to read or parse profile file at ${profilePath}:`, e);
        }
    }
    
    for (let i=0; i<profiles.length; i++) {
        const agent_process = new AgentProcess();
        const profile = readFileSync(profiles[i], 'utf8');
        const agent_json = JSON.parse(profile);
        mainProxy.registerAgent(agent_json.name, agent_process);
        agent_process.start(profiles[i], load_memory, init_message, i, args.task_path, args.task_id);
        await new Promise(resolve => setTimeout(resolve, 1000));
    }
    initSTT();
}

try {
    main();
} catch (error) {
    console.error('An error occurred:', error);
    console.error(error.stack || '', error.message || '');

    let suggestedFix = "Not sure. Try asking on Discord, or filing a GitHub issue.";

    if (error.message) {
        if (error.message.includes("ECONNREFUSED")) {
            suggestedFix = `Ensure your game is Open to LAN on port ${settings.port}, and you're playing version ${settings.minecraft_version}. If you're using a different version, change it in settings.js!`;
        } else if (error.message.includes("ERR_MODULE_NOT_FOUND")) {
            suggestedFix = "Run `npm install`.";
        } else if (error.message.includes("ECONNRESET")) {
            suggestedFix = `Make sure that you're playing version ${settings.minecraft_version}. If you're using a different version, change it in settings.js!`;
        } else if (error.message.includes("ERR_DLOPEN_FAILED")) {
            suggestedFix = "Delete the `node_modules` folder, and run `npm install` again.";
        } else if (error.message.includes("Cannot read properties of null (reading 'version')")) {
            suggestedFix = "Try again, with a vanilla Minecraft client - mindcraft-ce doesn't support mods!";
        } else if (error.message.includes("not found in keys.json")) {
            suggestedFix = "Ensure to rename `keys.example.json` to `keys.json`, and fill in the necessary API key.";
        }
    }

    console.log("\n\n✨ Suggested Fix: " + suggestedFix);
    process.exit(1);
}
