@echo off
title Minecraft AI City Builder - Startup Sequence
echo Starting Minecraft AI Automation...
echo.

:: Step 1: Start Minecraft server
echo [1/3] Starting Minecraft server...
start "Minecraft Server" cmd /k "cd /d C:\Users\james\minecraft-ai-city && java -Xmx4G -Xms2G -jar server.jar nogui"
timeout /t 10 >nul

:: Step 2: Run the LLM model (optional - comment out if already running manually)
:: echo [2/3] Launching deepseek-coder model...
:: start "Ollama Model" cmd /k "ollama run deepseek-coder:6.7b-instruct"
:: timeout /t 5 >nul

:: Step 3: Run the bot script
echo [2/3] Launching bot-city-llm.js...
start "Bot Script" cmd /k "cd /d C:\Users\james\minecraft-ai-city && node bot-city-llm.js"

echo.
echo All systems launched. Close this window to terminate all.
pause
