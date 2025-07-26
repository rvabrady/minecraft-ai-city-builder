const mineflayer = require('mineflayer');
const axios = require('axios');
const readline = require('readline');
const { pathfinder, Movements, goals } = require('mineflayer-pathfinder');
const { Vec3 } = require('vec3');

// ====================== CONFIG ========================
const MODEL_NAME = process.env.AI_MODEL || 'deepseek-coder:6.7b-instruct';
const API_URL = process.env.AI_API || 'http://localhost:11434/api/generate';
const HOST = process.env.MINECRAFT_HOST || 'localhost';
const PORT = parseInt(process.env.MINECRAFT_PORT) || 25565;
// ======================================================

let bot;
let botReady = false;
let rl;

// ========== Helpers ==========
const fixBlockNames = (text) => {
  return text
    .replace(/minecraft:minecraft:/g, 'minecraft:')
    .replace(/\bglass\b/g, 'minecraft:glass')
    .replace(/\bglass_pane\b/g, 'minecraft:glass_pane')
    .replace(/\biron\b/g, 'minecraft:iron_block')
    .replace(/\bbrick\b/g, 'minecraft:bricks')
    .replace(/\bstone\b/g, 'minecraft:stone')
    .replace(/\bair\b/g, 'minecraft:air')
    .replace(/\bdirt\b/g, 'minecraft:dirt')
    .replace(/\bsand\b/g, 'minecraft:sand')
    .replace(/\bgrass\b/g, 'minecraft:grass_block')
    .replace(/\btnt\b/g, 'minecraft:tnt')
    .replace(/\blava\b/g, 'minecraft:lava')
    .replace(/\bwater\b/g, 'minecraft:water')
    .replace(/\bobsidian\b/g, 'minecraft:obsidian')
    .replace(/\bwood\b/g, 'minecraft:oak_planks');
};

const moveToSafeDistance = (cx, cy, cz, onArrive) => {
  const safeX = cx + 3;
  const safeZ = cz + 3;
  const safeY = Math.floor(bot.entity.position.y);
  const target = new Vec3(safeX, safeY, safeZ);

  bot.chat('/say Moving to safe distance...');
  bot.pathfinder.setGoal(new goals.GoalBlock(target.x, target.y, target.z));

  const interval = setInterval(() => {
    const dist = bot.entity.position.distanceTo(target);
    if (dist < 2) {
      clearInterval(interval);
      onArrive();
    }
  }, 1000);
};

// ========== Bot Setup ==========
const createBot = () => {
  if (bot && bot.quit) {
    try { bot.quit(); } catch {}
  }

  bot = mineflayer.createBot({
    host: HOST,
    port: PORT,
    username: 'CityBuilderBot',
    version: '1.20.4'
  });

  bot.loadPlugin(pathfinder);

  bot.once('spawn', () => {
    botReady = true;
    const defaultMove = new Movements(bot);
    bot.pathfinder.setMovements(defaultMove);
    console.log('[+] Bot spawned and ready.');
    bot.chat('/gamemode creative');
    bot.chat('/say AI Builder ready.');
    setTimeout(prompt, 1000);
  });

  bot.on('end', () => {
    console.warn('[!] Bot disconnected.');
    botReady = false;
    setTimeout(createBot, 5000);
  });

  bot.on('error', (err) => {
    console.error('[!] Bot error:', err.message);
    botReady = false;
  });

  bot.on('kicked', (reason) => {
    console.warn('[!] Kicked:', reason);
    botReady = false;
  });

  console.log('[*] Bot setup complete. Waiting for spawn...');
};

// ========== Prompt Logic ==========
const prompt = () => {
  if (!rl) {
    rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  }
  if (!botReady || !bot.entity) {
    return setTimeout(prompt, 1500);
  }

  rl.question('[Command or Build] > ', async (text) => {
    const trimmed = text.trim().toLowerCase();
    if (trimmed === 'exit') {
      rl.close();
      bot.quit();
      return;
    }
    if (trimmed.startsWith('goto')) {
      const [, x, y, z] = text.split(' ');
      if (!isNaN(x) && !isNaN(y) && !isNaN(z)) {
        bot.chat(`/say Walking to ${x} ${y} ${z}`);
        bot.pathfinder.setGoal(new goals.GoalBlock(+x, +y, +z));
      }
      return prompt();
    }

    const pos = bot.entity.position;
    const context = `Bot is at x=${Math.floor(pos.x)}, y=${Math.floor(pos.y)}, z=${Math.floor(pos.z)}.
Avoid underwater, floating, or underground builds.
Use only full structure commands like /fill, //pyramid, or //sphere.
Never use /setblock unless explicitly asked.
Reply with ONE valid Minecraft command only—no extra text.`;

    try {
      //  → Send a strong, multi-line prompt that forbids /setblock
      const aiRes = await axios.post(API_URL, {
        model: MODEL_NAME,
        prompt: [
          context,
          `User request: "${text}"`,
          "You are a Minecraft AI command generator that ONLY outputs full-structure commands.",
          "- Reply with EXACTLY one valid in-game command (/fill, //box, //pyramid, etc.).",
          "- NEVER use /setblock or any non-structure commands.",
          "- Do NOT apologize or emit any other text.",
          "- Use absolute or relative (~) coordinates so I can parse numbers.",
        ].join("\n"),
        stream: false
      });

      // 1. Grab the raw AI response
      let raw = aiRes.data.response.trim();
      console.log('[Raw AI response]:', raw);

      // 2. Strip HTML tags
      let cleaned = raw.replace(/<.*?>/g, '');

      // 3. Remove literal triple-backticks
      cleaned = cleaned.replace(/[\x60]{3}/g, '');

      // 4. Strip leading/trailing quotes
      cleaned = cleaned.replace(/^['"]|['"]$/g, '');

      // 5. Pick the first line that starts with "/" or "//"
      const lines = cleaned.split('\n');
      const commandLine = lines.find(line => {
        const t = line.trim();
        return t.startsWith('/') || t.startsWith('//');
      }) || '';

      // 6. Normalize and trim
      let reply = fixBlockNames(commandLine.trim());
      console.log('[AI Command]:', reply);

      // 7. Fallback: if it's /setblock, convert to a single-block /fill
      if (reply.startsWith('/setblock')) {
        const parts = reply.split(/\s+/);
        const [ , x, y, z, ...blockParts ] = parts;
        const blockName = blockParts.join(' ');
        reply = `/fill ${x} ${y} ${z} ${x} ${y} ${z} ${blockName}`;
        console.log('[Transformed setblock→fill]:', reply);
      }

      // 8. If it's not a valid command, ask again
      if (!reply.startsWith('/') && !reply.startsWith('//')) {
        bot.chat('/say AI gave no usable command. Try again.');
        return prompt();
      }

      // 9. Extract coords and move to safe distance
      const coords = reply.match(/-?\d+/g)?.map(Number);
      if (coords && coords.length >= 6) {
        const [x1, y1, z1, x2, y2, z2] = coords;
        const cx = Math.floor((x1 + x2) / 2);
        const cz = Math.floor((z1 + z2) / 2);
        moveToSafeDistance(cx, y1, cz, () => {
          bot.chat('/say Executing build...');
          setTimeout(() => bot.chat(reply), 500);
        });
      } else {
        bot.chat('/say Command ignored—needs full structure command.');
      }
    } catch (err) {
      console.error('[!] AI error:', err.message);
      bot.chat('/say AI error. Skipping.');
    }

    prompt();
  });
};

createBot();
