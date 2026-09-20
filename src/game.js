const WIDTH = 1920;
const HEIGHT = 1080;
const GROUND_Y = 744;
const BLOCK_SIZE = 126;
const STORAGE_KEY = "cousins-platformer-settings-v1";
const RECORD_KEY = "cousins-platformer-record-v1";

const canvas = document.querySelector("#game");
const ctx = canvas.getContext("2d");
const distanceEl = document.querySelector("#distance");
const recordEl = document.querySelector("#record");
const gameOverEl = document.querySelector("#game-over");
const panel = document.querySelector("#debug-panel");
const openDebugButton = document.querySelector("#open-debug");

const defaults = {
  initialSpeed: 270,
  acceleration: 15,
  parallax: 0.15,
  gapMin: 100,
  gapMax: 335,
  heroGap: 0,
  jumpImpulse: 1300,
  gravity: 3000,
  maxHoldTime: 0.22,
  holdGravityFactor: 0.35,
  airRecoverySpeed: 190,
  blockFrequency: 55,
  colliderWidth: 58,
  colliderHeight: 142,
  colliderOffsetY: 2,
  showColliders: 0,
};

const defaultPatterns = [
  [[0, 2, 0], [0, 1, 0], [4, 3, 0]],
  [[0, 0, 0], [0, 2, 0], [4, 3, 1]],
  [[0, 0, 0], [0, 0, 4], [1, 3, 2]],
  [[0, 0, 0], [0, 3, 0], [1, 2, 4]],
];

const controlSchema = [
  ["initialSpeed", "Vitesse initiale du scroll", 10, 1200, 10],
  ["acceleration", "Accélération du scroll", 0, 100, 0.5],
  ["parallax", "Coefficient du fond", 0, 1, 0.01],
  ["gapMin", "Trou minimum (px)", 0, 700, 5],
  ["gapMax", "Trou maximum (px)", 0, 1000, 5],
  ["heroGap", "Écart entre héros (px)", 0, 250, 2],
  ["jumpImpulse", "Impulsion du saut", 100, 1800, 10],
  ["gravity", "Gravité", 200, 5000, 25],
  ["maxHoldTime", "Appui maximum (s)", 0.02, 1, 0.01],
  ["holdGravityFactor", "Gravité pendant appui", 0.05, 1, 0.05],
  ["airRecoverySpeed", "Retour horizontal en saut", 0, 600, 10],
  ["blockFrequency", "Fréquence des blocs (%)", 0, 100, 1],
  ["colliderWidth", "Collision héros : largeur", 10, 180, 2],
  ["colliderHeight", "Collision héros : hauteur", 10, 220, 2],
  ["colliderOffsetY", "Collision héros : position Y", -80, 100, 2],
  ["showColliders", "Afficher les collisions (0/1)", 0, 1, 1],
];

let config = loadSettings();
let patterns = structuredClone(defaultPatterns);
let assets;
let platforms = [];
let blocks = [];
let heroes = [];
let keys = new Set();
let speed = config.initialSpeed;
let travelledPixels = 0;
let backgroundOffset = 0;
let lastTime = 0;
let restarting = false;
let record = Number(localStorage.getItem(RECORD_KEY) || 0);

function loadSettings() {
  try {
    return { ...defaults, ...JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}") };
  } catch {
    return { ...defaults };
  }
}

function loadImage(path) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`Impossible de charger ${path}`));
    image.src = path;
  });
}

async function loadAssets() {
  const [background, ...images] = await Promise.all([
    loadImage("assets/background.png"),
    loadImage("assets/ground_1.png"),
    loadImage("assets/ground_2.png"),
    loadImage("assets/ground_3.png"),
    loadImage("assets/block_1.png"),
    loadImage("assets/block_2.png"),
    loadImage("assets/block_3.png"),
    loadImage("assets/block_4.png"),
    loadImage("assets/hero_1.png"),
    loadImage("assets/hero_2.png"),
    loadImage("assets/hero_3.png"),
  ]);

  return {
    background,
    grounds: images.slice(0, 3),
    blockImages: images.slice(3, 7),
    heroImages: images.slice(7, 10),
  };
}

function randomBetween(min, max) {
  return min + Math.random() * Math.max(0, max - min);
}

function heroCollider(hero) {
  return {
    x: hero.x + (hero.image.width - config.colliderWidth) / 2,
    y: hero.footY - config.colliderHeight - config.colliderOffsetY,
    w: config.colliderWidth,
    h: config.colliderHeight,
  };
}

function overlaps(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

function updateHeroTargets(snapToTarget = false) {
  let x = 55;
  heroes.forEach((hero) => {
    hero.targetX = x;
    if (snapToTarget) hero.x = x;
    x += hero.image.width + config.heroGap;
  });
}

function makeHeroes() {
  const controls = ["KeyA", "KeyG", "KeyL"];
  heroes = assets.heroImages.map((image, index) => ({
    image,
    key: controls[index],
    x: 0,
    targetX: 0,
    footY: GROUND_Y,
    vy: 0,
    grounded: true,
    alive: true,
    holdTime: 0,
  }));
  updateHeroTargets(true);
}

function createPlatform(x, forcedImage = null, allowBlocks = true) {
  const image = forcedImage || assets.grounds[Math.floor(Math.random() * assets.grounds.length)];
  const platform = { image, x, y: GROUND_Y, w: image.width, h: image.height };
  platforms.push(platform);

  if (allowBlocks && Math.random() * 100 < config.blockFrequency) {
    addPatternToPlatform(platform, patterns[Math.floor(Math.random() * patterns.length)]);
  }
  return platform;
}

function addPatternToPlatform(platform, pattern) {
  const gridLeft = platform.x + (platform.w - BLOCK_SIZE * 3) / 2;
  pattern.forEach((row, rowIndex) => {
    row.forEach((value, columnIndex) => {
      if (!value) return;
      blocks.push({
        image: assets.blockImages[value - 1],
        x: gridLeft + columnIndex * BLOCK_SIZE,
        y: GROUND_Y - (3 - rowIndex) * BLOCK_SIZE,
        w: BLOCK_SIZE,
        h: BLOCK_SIZE,
      });
    });
  });
}

function ensureWorldAhead() {
  let last = platforms.reduce((rightmost, current) => current.x > rightmost.x ? current : rightmost, platforms[0]);
  while (last.x + last.w < WIDTH + 1400) {
    const minGap = Math.min(config.gapMin, config.gapMax);
    const maxGap = Math.max(config.gapMin, config.gapMax);
    last = createPlatform(last.x + last.w + randomBetween(minGap, maxGap));
  }
}

function resetGame() {
  platforms = [];
  blocks = [];
  keys.clear();
  speed = config.initialSpeed;
  travelledPixels = 0;
  backgroundOffset = 0;
  restarting = false;
  gameOverEl.classList.add("hidden");
  createPlatform(-80, assets.grounds[2], false);
  ensureWorldAhead();
  makeHeroes();
  updateHud();
}

function jump(hero) {
  if (!hero.alive || !hero.grounded) return;
  hero.grounded = false;
  hero.vy = -config.jumpImpulse;
  hero.holdTime = 0;
}

function moveWorld(dt) {
  const dx = speed * dt;
  travelledPixels += dx;
  backgroundOffset = (backgroundOffset + dx * config.parallax) % WIDTH;
  platforms.forEach((platform) => { platform.x -= dx; });
  blocks.forEach((block) => { block.x -= dx; });
  platforms = platforms.filter((platform) => platform.x + platform.w > -300);
  blocks = blocks.filter((block) => block.x + block.w > -300);
  ensureWorldAhead();
}

function resolveHeroPhysics(hero, dt) {
  if (!hero.alive) return;

  const previousCollider = heroCollider(hero);
  const holding = keys.has(hero.key) && hero.holdTime < config.maxHoldTime && hero.vy < 0;
  const gravity = config.gravity * (holding ? config.holdGravityFactor : 1);
  if (holding) hero.holdTime += dt;

  hero.vy += gravity * dt;
  hero.footY += hero.vy * dt;
  hero.grounded = false;

  const solids = [...platforms, ...blocks];
  let collider = heroCollider(hero);
  let landing = null;

  if (hero.vy >= 0) {
    for (const solid of solids) {
      const previousBottom = previousCollider.y + previousCollider.h;
      const currentBottom = collider.y + collider.h;
      const horizontalOverlap = collider.x < solid.x + solid.w && collider.x + collider.w > solid.x;
      if (horizontalOverlap && previousBottom <= solid.y + 5 && currentBottom >= solid.y) {
        if (!landing || solid.y < landing.y) landing = solid;
      }
    }
  }

  if (landing) {
    hero.footY = landing.y + config.colliderOffsetY;
    hero.vy = 0;
    hero.grounded = true;
    collider = heroCollider(hero);
  }

  // Collision contre le dessous d'un bloc ou d'une plateforme.
  if (hero.vy < 0) {
    for (const solid of solids) {
      const previousTop = previousCollider.y;
      const currentTop = collider.y;
      const solidBottom = solid.y + solid.h;
      const horizontalOverlap = collider.x < solid.x + solid.w && collider.x + collider.w > solid.x;
      if (horizontalOverlap && previousTop >= solidBottom - 5 && currentTop <= solidBottom) {
        hero.footY = solidBottom + config.colliderHeight + config.colliderOffsetY;
        hero.vy = 0;
        collider = heroCollider(hero);
        break;
      }
    }
  }

  // Les blocs et les faces verticales des sols repoussent le héros vers la gauche.
  for (const solid of solids) {
    if (!overlaps(collider, solid)) continue;
    const overlapX = collider.x + collider.w - solid.x;
    if (overlapX > 0 && collider.x < solid.x) {
      hero.x -= overlapX;
      collider = heroCollider(hero);
    }
  }

  // Un héros retardé ne récupère sa place horizontale que lorsqu'il est en l'air.
  if (!hero.grounded && hero.x < hero.targetX) {
    hero.x = Math.min(hero.targetX, hero.x + config.airRecoverySpeed * dt);
  }

  const finalCollider = heroCollider(hero);
  if (hero.footY - hero.image.height > HEIGHT + 80 || finalCollider.x + finalCollider.w < 0) {
    hero.alive = false;
  }
}

function update(dt) {
  if (restarting) return;
  speed += config.acceleration * dt;
  moveWorld(dt);
  heroes.forEach((hero) => resolveHeroPhysics(hero, dt));
  updateHud();

  if (heroes.every((hero) => !hero.alive)) {
    finishRun();
  }
}

function finishRun() {
  restarting = true;
  const distance = Math.floor(travelledPixels / 100);
  if (distance > record) {
    record = distance;
    localStorage.setItem(RECORD_KEY, String(record));
  }
  updateHud();
  gameOverEl.classList.remove("hidden");
  window.setTimeout(resetGame, 2000);
}

function updateHud() {
  distanceEl.textContent = `${Math.floor(travelledPixels / 100)} m`;
  recordEl.textContent = `${record} m`;
}

function drawBackground() {
  const x = -backgroundOffset;
  ctx.drawImage(assets.background, x, 0, WIDTH, HEIGHT);
  ctx.drawImage(assets.background, x + WIDTH, 0, WIDTH, HEIGHT);
}

function drawWorld() {
  platforms.forEach((platform) => ctx.drawImage(platform.image, platform.x, platform.y));
  blocks.forEach((block) => ctx.drawImage(block.image, block.x, block.y));
  heroes.forEach((hero) => {
    if (!hero.alive) return;
    ctx.drawImage(hero.image, hero.x, hero.footY - hero.image.height);
  });
}

function drawColliders() {
  if (!config.showColliders) return;
  ctx.save();
  ctx.lineWidth = 3;
  ctx.strokeStyle = "#ff164b";
  heroes.forEach((hero) => {
    if (!hero.alive) return;
    const c = heroCollider(hero);
    ctx.strokeRect(c.x, c.y, c.w, c.h);
  });
  ctx.strokeStyle = "#00ff95";
  [...platforms, ...blocks].forEach((solid) => ctx.strokeRect(solid.x, solid.y, solid.w, solid.h));
  ctx.restore();
}

function render() {
  ctx.clearRect(0, 0, WIDTH, HEIGHT);
  drawBackground();
  drawWorld();
  drawColliders();
}

function frame(time) {
  const dt = Math.min((time - lastTime) / 1000 || 0, 1 / 30);
  lastTime = time;
  update(dt);
  render();
  requestAnimationFrame(frame);
}

function buildDebugPanel() {
  const container = document.querySelector("#debug-controls");
  container.replaceChildren();

  controlSchema.forEach(([key, label, min, max, step]) => {
    const wrapper = document.createElement("div");
    wrapper.className = "control";
    const labelEl = document.createElement("label");
    labelEl.htmlFor = `setting-${key}`;
    labelEl.textContent = label;
    const input = document.createElement("input");
    input.type = "number";
    input.id = `setting-${key}`;
    input.min = min;
    input.max = max;
    input.step = step;
    input.value = config[key];
    input.addEventListener("change", () => {
      config[key] = Math.min(max, Math.max(min, Number(input.value)));
      input.value = config[key];
      localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
      if (key === "heroGap") updateHeroTargets(false);
      if (key === "initialSpeed" && travelledPixels === 0) speed = config.initialSpeed;
    });
    wrapper.append(labelEl, input);
    container.append(wrapper);
  });

  document.querySelector("#patterns-json").value = JSON.stringify(patterns, null, 2);
}

function validatePatterns(value) {
  if (!Array.isArray(value) || value.length === 0) return false;
  return value.every((pattern) =>
    Array.isArray(pattern) && pattern.length === 3 && pattern.every((row) =>
      Array.isArray(row) && row.length === 3 && row.every((cell) => Number.isInteger(cell) && cell >= 0 && cell <= 4)
    )
  );
}

function toggleDebug(force) {
  const shouldOpen = force ?? panel.classList.contains("hidden");
  panel.classList.toggle("hidden", !shouldOpen);
  openDebugButton.classList.toggle("hidden", shouldOpen);
}

window.addEventListener("keydown", (event) => {
  if (event.code === "KeyD" && !event.repeat) {
    toggleDebug();
    return;
  }
  const hero = heroes.find((candidate) => candidate.key === event.code);
  if (!hero) return;
  event.preventDefault();
  keys.add(event.code);
  if (!event.repeat) jump(hero);
});

window.addEventListener("keyup", (event) => keys.delete(event.code));
window.addEventListener("blur", () => keys.clear());

document.querySelector("#close-debug").addEventListener("click", () => toggleDebug(false));
openDebugButton.addEventListener("click", () => toggleDebug(true));
document.querySelector("#restart").addEventListener("click", resetGame);
document.querySelector("#reset-settings").addEventListener("click", () => {
  config = { ...defaults };
  localStorage.removeItem(STORAGE_KEY);
  buildDebugPanel();
  resetGame();
});

document.querySelector("#apply-patterns").addEventListener("click", () => {
  const status = document.querySelector("#patterns-status");
  try {
    const candidate = JSON.parse(document.querySelector("#patterns-json").value);
    if (!validatePatterns(candidate)) throw new Error("Chaque pattern doit contenir 3 lignes de 3 valeurs entre 0 et 4.");
    patterns = candidate;
    status.textContent = `${patterns.length} pattern(s) appliqué(s).`;
  } catch (error) {
    status.textContent = error.message;
    status.style.color = "#fda4af";
    window.setTimeout(() => { status.style.color = ""; }, 1800);
  }
});

try {
  assets = await loadAssets();
  buildDebugPanel();
  resetGame();
  requestAnimationFrame(frame);
} catch (error) {
  console.error(error);
  document.body.textContent = error.message;
}
