// bot-city-llm.js

// ====================== CONFIG ========================
const MODEL_NAME = process.env.AI_MODEL || 'deepseek-coder:6.7b-instruct';
const API_URL    = process.env.AI_API   || 'http://localhost:11434/api/generate';
const HOST       = process.env.MINECRAFT_HOST || 'localhost';
const PORT       = parseInt(process.env.MINECRAFT_PORT) || 25565;
// ======================================================

const mineflayer = require('mineflayer');
const { pathfinder, Movements, goals: { GoalNear } } = require('mineflayer-pathfinder');
const Vec3 = require('vec3');
const axios = require('axios');
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const readline = require('readline');

// Build queue
const buildQueue = [];

// ==================== CREATE BOT ====================
const bot = mineflayer.createBot({
  host: HOST,
  port: PORT,
  username: 'CityBuilderBot',
  version: '1.20.4'
});

// Load pathfinder plugin
bot.loadPlugin(pathfinder);

// ==================== ON SPAWN: INIT & TELEPORT ====================
bot.once('spawn', () => {
  // Log bot spawn position
  console.log(
    `[+] Bot spawn position: ` +
    `${bot.entity.position.x.toFixed(0)},` +
    `${bot.entity.position.y.toFixed(0)},` +
    `${bot.entity.position.z.toFixed(0)}`
  );

  // Initialize pathfinder
  const defaultMoves = new Movements(bot);
  bot.pathfinder.setMovements(defaultMoves);

  console.log('[*] Bot spawned. Checking for nearby players...');

  // Wait briefly to let the player list populate
  setTimeout(() => {
    const owner = Object.keys(bot.players).find(name => name !== bot.username);

    if (owner && bot.players[owner].entity) {
      const playerPos = bot.players[owner].entity.position;
      const offset = playerPos.offset(1, 0, 0); // Move 1 block east
      const x = Math.floor(offset.x);
      const y = Math.floor(offset.y);
      const z = Math.floor(offset.z);

      bot.chat(`/tp ${bot.username} ${x} ${y} ${z}`);
      console.log(`[+] Teleported to ${owner}'s side at ${x},${y},${z}`);
    } else {
      const x = 16, y = 69, z = 80; // World spawn fallback
      bot.chat(`/tp ${bot.username} ${x} ${y} ${z}`);
      console.log(`[!] No player found — forced teleport to world spawn at ${x},${y},${z}`);
    }
  }, 1000);
});

// ==================== STDIN LISTENER ====================
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  prompt: ''
});
rl.on('line', line => {
  const cmd = line.trim();
  if (cmd) enqueueCommand(cmd);
});

// ==================== DASHBOARD SETUP ====================
function setupDashboard() {
  const app = express();
  const server = http.createServer(app);
  const io = socketIo(server);

  app.use(express.static(__dirname + '/public'));

  io.on('connection', socket => {
    socket.emit('status', { queueLength: buildQueue.length });
  });

  server.listen(3000, () => {
    console.log('[+] Dashboard running at http://localhost:3000');
  });

  return () => io.emit('status', { queueLength: buildQueue.length });
}
const broadcastStatus = setupDashboard();

// ==================== QUEUE HANDLING ====================
function enqueueCommand(message) {
  buildQueue.push(message);
  broadcastStatus();
}

async function processQueue() {
  if (buildQueue.length === 0) {
    setTimeout(processQueue, 500);
    return;
  }
  const message = buildQueue.shift();
  broadcastStatus();
  await handleCommand(message);
  processQueue();
}

// ==================== COMMAND HANDLER ====================
async function handleCommand(message) {
  console.log(`[>] Handling command: ${message}`);

  if (message.startsWith('/') && !message.startsWith('//build')) {
    bot.chat(message);
    return;
  }

  const normalized = message.replace(/^\/build/, '//build');
  const directRegex = /^\/\/build\s+-?\d+/;
  const rawCmd = directRegex.test(normalized)
    ? normalized
    : await queryAI(message);

  const buildCommands = parseBuildCommands(rawCmd);
  for (const parts of buildCommands) {
    await executeBuild(parts);
  }
}

// ==================== AI QUERY ====================
async function queryAI(userMessage) {
  const systemPreamble =
    "You are a Minecraft build-command generator. " +
    "Output ONLY lines that begin with //build in the format:\n" +
    "//build <X> <Z> <block> <width> <height> [hollow]\n" +
    "Do NOT output anything else.\n\n";

  try {
    const res = await axios.post(API_URL, {
      model:       MODEL_NAME,
      prompt:      systemPreamble + userMessage,
      max_tokens:  200,
      temperature: 0.2,
      stream:      false
    });
    const text =
      res.data.choices?.[0]?.text ||
      res.data.response ||
      '';
    return text.trim();
  } catch (err) {
    console.error('[!] AI query failed:', err.message);
    return '';
  }
}

// ==================== PARSE BUILD COMMANDS ====================
function parseBuildCommands(text) {
  const lines = text.split('\n')
    .map(l => l.trim())
    .filter(l => l.startsWith('//build'));
  return lines.map(line => line.split(/\s+/)).filter(parts => {
    if (parts.length >= 6) return true;
    console.warn('[!] Invalid build command:', line);
    return false;
  });
}

// ==================== GROUND DETECTION ====================
async function findGroundY(x, z) {
  for (let y = 255; y >= 0; y--) {
    const block = bot.blockAt(new Vec3(x, y, z));
    if (block && block.boundingBox === 'block') {
      return y + 1;
    }
  }
  return 1;
}

// ==================== FLATTEN & BUILD ====================
async function executeBuild(parts) {
  const x = parseInt(parts[1], 10);
  const z = parseInt(parts[2], 10);
  const blockName = parts[3];
  const width  = parseInt(parts[4], 10);
  const height = parseInt(parts[5], 10);
  const hollow = parts[6] === 'hollow';

  const groundY = await findGroundY(x, z);
  console.log(`[+] Detected surface at Y=${groundY}`);

  const centerX = x + Math.floor(width  / 2);
  const centerZ = z + Math.floor(width  / 2);
  console.log(`[>] Starting walk to ${centerX},${groundY + 1},${centerZ}`);

  await bot.pathfinder.goto(new GoalNear(centerX, groundY + 1, centerZ, 1));

  const pos = bot.entity.position;
  console.log(`[+] Bot moved to ${pos.x.toFixed(2)}, ${pos.y.toFixed(2)}, ${pos.z.toFixed(2)}`);

  await new Promise(r => setTimeout(r, 300));

  console.log('[*] Flattening area...');
  await bot.chat(`/fill ${x} ${groundY - 1} ${z} ${x + width - 1} ${groundY - 1} ${z + width - 1} minecraft:grass_block`);

  console.log('[*] Placing blocks...');
  await bot.chat(`//fill ${x} ${groundY} ${z} ${x + width - 1} ${groundY} ${z + width - 1} ${blockName}`);

  const y1 = groundY + 1, y2 = groundY + height - 1;
  await bot.chat(`//fill ${x} ${y1} ${z}             ${x}             ${y2} ${z + width - 1} ${blockName}`);
  await bot.chat(`//fill ${x + width - 1} ${y1} ${z}       ${x + width - 1} ${y2} ${z + width - 1} ${blockName}`);
  await bot.chat(`//fill ${x + 1} ${y1} ${z + width - 1} ${x + width - 2} ${y2} ${z + width - 1} ${blockName}`);
  await bot.chat(`//fill ${x + 1} ${y1} ${z}             ${x + width - 2} ${y2} ${z}             ${blockName}`);

  if (!hollow) {
    await bot.chat(`//fill ${x} ${groundY + height} ${z} ${x + width - 1} ${groundY + height} ${z + width - 1} ${blockName}`);
  }

  console.log(
    `[+] Built ${blockName} at ${x},${groundY},${z} size ${width}×${height}` +
    (hollow ? ' (hollow)' : '')
  );
}

// ==================== START PROCESSING ====================
bot.on('login', () => {
  console.log('[*] Ready for commands.');
  processQueue();
});
