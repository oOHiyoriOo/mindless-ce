const settings = {
    "minecraft_version": "1.21.1", // supports up to 1.21.1
    "host": "hanime.zip", // or "localhost", "your.ip.address.here"
    "port": 9696,
    "auth": "offline", // or "microsoft"

    "host_mindserver": true,
    // the mindserver manages all agents and hosts the UI
    "mindserver_port": 8080,

    "base_profile": "D:\\.projects\\NodeJS\\mindless-ce\\profiles\\defaults\\survival.json", // survival, creative, assistant, or god_mode
    "profiles": [
        "./ranni.json",
        // "./profiles/jibril.json",
        // "./profiles/phi4.json",
        // "./profiles/rias.json",
        
	// using more than 1 profile requires you to /msg each bot indivually
        // individual profiles override values from the base profile
    ],

    "load_memory": true, // load memory from previous session
    "init_message": "You want to become a Well known Trader! gather materials and Build a Shop! But be aware monsters try to interrupt you!", // sends to all on spawn
    "only_chat_with": ["NogitsuneZero"], // users that the bots listen to and send general messages to. if empty it will chat publicly
    "speak": false, // allows all bots to speak through system text-to-speech. works on windows, mac, on linux you need to `apt install espeak`
    "language": "en", // translate to/from this language. Supports these language names: https://cloud.google.com/translate/docs/languages
    "render_bot_view": true, // show bot's view in browser at localhost:3000, 3001...

    "allow_insecure_coding": true, // allows newAction command and model can write/run code on your computer. enable at own risk
    "allow_vision": false, // allows vision model to interpret screenshots as inputs
    "blocked_actions" : ["!checkBlueprint", "!checkBlueprintLevel", "!getBlueprint", "!getBlueprintLevel"] , // commands to disable and remove from docs. Ex: ["!setMode"]
    "code_timeout_mins": 60, // minutes code is allowed to run. -1 for no timeout
    "relevant_docs_count": 8, // number of relevant code function docs to select for prompting. -1 for all

    "max_messages": 32, // max number of messages to keep in context
    "num_examples": 0, // number of examples to give to the model
    "max_commands": -1, // max number of commands that can be used in consecutive responses. -1 for no limit
    "verbose_commands": true, // show full command syntax
    "narrate_behavior": false, // chat simple automatic actions ('Picking up item!')
    "chat_bot_messages": false, // publicly chat messages to other bots

    "block_place_delay": 1000, // delay between placing blocks (ms) if using newAction. helps avoid bot being kicked by anti-cheat mechanisms on servers.
    "log_all_prompts": false, // log ALL prompts to file

    "use_qdrant_memory": true, // or false to disable
    "qdrant_url": "http://192.168.188.178:6333",
    "qdrant_port": 6333,
};

export default settings;
