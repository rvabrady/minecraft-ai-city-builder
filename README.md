# Minecraft AI City Builder

This project is an autonomous AI system that controls a Minecraft bot capable of flattening land, generating structures, and building full cities — all from natural language prompts. It uses a local large language model (LLM), terrain awareness, structure planning logic, and command execution through Minecraft's `/fill`, `/setblock`, and `/clone` commands.

## 🔧 How It Works

- **LLM Interface**: Prompts like "build a gothic cathedral" are passed to a local model (via Ollama or similar).
- **Command Parser**: The AI translates responses into valid Minecraft building commands.
- **Structure Logic**: A planning module determines structure size, placement, and terrain flattening.
- **Mineflayer Bot**: Executes commands, moves intelligently, and adapts to terrain in real-time.
- **Task Logging**: Every structure is logged to prevent overlap and track progress.

## 🧠 Features

- Works with vanilla Minecraft 1.20.4
- Compatible with WorldEdit-style command generation
- Autonomous city block building (residential, towers, bridges, etc.)
- Open-source dataset of prompt → command pairs included
- Logging and error-handling for long runtimes

## 📁 Repository Contents

| File | Description |
|------|-------------|
| `bot-city-llm.js` | Main control logic for the AI bot |
| `structure_planner.js` | Plans builds based on prompt type and terrain |
| `prompt_command_dataset.json` | Training data (prompt → command) |
| `task_log.txt` | Example of structure queue logging |
| `ollama_wrapper.sh` | Optional script to run LLM inference locally |

## 💻 Requirements

- Node.js
- Python (for optional scripts)
- Mineflayer
- Minecraft Java Edition (1.20.4)
- Optional: Ollama, Whisper, Piper TTS

## 🚀 Getting Started

1. Clone this repo  
   `git clone https://github.com/rvabrady/minecraft-ai-city-builder.git`
2. Install dependencies (Node + Python)
3. Launch Minecraft server in creative mode
4. Run `bot-city-llm.js`
5. Give it a prompt like `"Build a floating bridge with towers"`

## 🤝 Contributing

This is a work in progress. Contributions welcome! Open an issue or PR if you’d like to help.

## 📜 License

MIT License – Open-source for anyone to use, modify, or extend.

---

Created by [James Brady](https://github.com/rvabrady)
