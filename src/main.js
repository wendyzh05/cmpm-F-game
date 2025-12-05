import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import * as CANNON from "cannon-es";

//HUD helpers
(function ensureHUD() {
  if (document.getElementById("toast")) return;

  const style = document.createElement("style");
  style.textContent = `
    #hud{position:fixed;inset:0;pointer-events:none;z-index:9999;font-family:system-ui,sans-serif}
    #instructions{position:absolute;top:12px;left:12px;pointer-events:auto;background:rgba(0,0,0,.55);color:#fff;padding:10px 12px;border-radius:10px;backdrop-filter:blur(4px);font-size:14px;line-height:1.35;max-width:320px}
    #instructions kbd{background:rgba(255,255,255,.15);padding:2px 6px;border-radius:6px;font-weight:600}
    #toast{position:absolute;top:18px;left:50%;transform:translateX(-50%);background:rgba(0,0,0,.7);color:#fff;padding:10px 14px;border-radius:999px;opacity:0;transition:opacity 180ms ease,transform 180ms ease;pointer-events:none;font-weight:600}
    #toast.show{opacity:1;transform:translateX(-50%) translateY(0)}
    #toast.success{background:rgba(16,185,129,.9)}
    #toast.fail{background:rgba(239,68,68,.9)}
    #footerHint{position:absolute;bottom:10px;right:12px;font-size:12px;color:#fff;background:rgba(0,0,0,.4);padding:6px 8px;border-radius:8px}
    #toggleHelpBtn{position:absolute;top:12px;right:12px;pointer-events:auto;padding:6px 10px;border-radius:999px;border:none;font-weight:600;background:rgba(255,255,255,.8);cursor:pointer}
    #inventory {
      position: absolute;
      bottom: 12px;
      left: 12px;
      pointer-events: none;
      background: rgba(0,0,0,.55);
      color: #fff;
      padding: 10px 12px;
      border-radius: 10px;
      backdrop-filter: blur(4px);
      min-width: 120px;
      font-size: 14px;
    }

    #inv-items {
      display: flex;
      gap: 8px;
      margin-top: 4px;
    }

    .inv-icon {
      width: 32px;
      height: 32px;
      background: rgba(255,255,255,0.15);
      border-radius: 6px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 28px;
      pointer-events: none;
      outline: 2px solid rgba(255,255,255,0.4);
    }

    #winBanner{
      position:absolute;
      inset:0;
      display:flex;
      align-items:center;
      justify-content:center;
      pointer-events:none;
      opacity:0;
      transition:opacity 250ms ease;
      font-size:32px;
      font-weight:800;
      color:#fff;
      text-shadow:0 2px 8px rgba(0,0,0,.7);
    }
    #winBanner.show{
      opacity:1;
    }
    #winBannerInner{
      background:rgba(17,24,39,.9);
      padding:24px 32px;
      border-radius:18px;
      border:1px solid rgba(255,255,255,.4);
    }
    #touch-joystick {
      position: absolute;
      bottom: 80px;
      left: 80px;
      width: 110px;
      height: 110px;
      border-radius: 50%;
      background: rgba(255,255,255,0.1);
      border: 2px solid rgba(255,255,255,0.25);
      pointer-events: auto;
      touch-action: none;      /* important on mobile */
      z-index: 10001;          /* above the canvas */
    }

    #touch-joystick-knob {
      position: absolute;
      left: 35px;
      top: 35px;
      width: 40px;
      height: 40px;
      border-radius: 50%;
      background: rgba(255,255,255,0.6);
      pointer-events: none;
    }
    #touch-jump {
      position: absolute;
      right: 28px;
      bottom: 64px;
      width: 84px;
      height: 84px;
      border-radius: 14px;
      background: rgba(255,255,255,0.08);
      color: #fff;
      display:flex;
      align-items:center;
      justify-content:center;
      font-weight:700;
      pointer-events: auto;
      user-select: none;
      -webkit-user-select: none;
      touch-action: manipulation;
    }
  `;
  document.head.appendChild(style);

  const hud = document.createElement("div");
  hud.id = "hud";
  hud.innerHTML = `
    <button id="toggleHelpBtn" aria-label="Toggle instructions">?</button>
    <div id="instructions" role="note"></div>
    <div id="toast" aria-live="polite"></div>
    <div id="footerHint">Falling off resets you.</div>
    <div id="inventory">
      <div id="inv-title">Inventory</div>
      <div id="inv-items"></div>
    </div>
    <div id="winBanner">
      <div id="winBannerInner">Level 2 complete! 🎉</div>
    </div>
    <div id="touch-joystick">
      <div id="touch-joystick-knob"></div>
    </div>
    <div id="touch-jump">Jump</div>
  `;
  document.body.appendChild(hud);

  // 🔧 Always show joystick & jump (desktop + mobile), pinned above canvas
  try {
    const joyEl = document.getElementById("touch-joystick");
    const jumpEl = document.getElementById("touch-jump");

    if (joyEl) {
      document.body.appendChild(joyEl);
      joyEl.style.display = "block";
      joyEl.style.position = "fixed";
      joyEl.style.bottom = "80px";
      joyEl.style.left = "80px";
      joyEl.style.zIndex = "10001";
      joyEl.style.touchAction = "none";
    }

    if (jumpEl) {
      document.body.appendChild(jumpEl);
      jumpEl.style.display = "flex";
      jumpEl.style.position = "fixed";
      jumpEl.style.right = "18px";
      jumpEl.style.bottom = "18px";
      jumpEl.style.width = "72px";
      jumpEl.style.height = "72px";
      jumpEl.style.alignItems = "center";
      jumpEl.style.justifyContent = "center";
      jumpEl.style.borderRadius = "12px";
      jumpEl.style.background = "rgba(255,255,255,0.12)";
      jumpEl.style.pointerEvents = "auto";
      jumpEl.style.fontWeight = "700";
      jumpEl.style.color = "#fff";
      jumpEl.style.zIndex = "10002";
    }
  } catch (e) {
    // ignore
  }
})();


const toastEl = /** @type {HTMLDivElement} */ (
  document.getElementById("toast")
);
const helpEl = /** @type {HTMLDivElement} */ (
  document.getElementById("instructions")
);
const toggleHelpBtn = /** @type {HTMLButtonElement} */ (
  document.getElementById("toggleHelpBtn")
);
const footerHintEl = /** @type {HTMLDivElement} */ (
  document.getElementById("footerHint")
);
const winBannerEl = /** @type {HTMLDivElement} */ (
  document.getElementById("winBanner")
);
let toastTimer = /** @type {number|null} */ (null);
let level2Won = false;

/**
 * succes and fail
 * @param {string | null} msg
 */
function showToast(msg, kind = "info", ms = 1600) {
  if (!toastEl) return;
  toastEl.textContent = msg;
  toastEl.classList.remove("success", "fail", "show");
  if (kind === "success") toastEl.classList.add("success");
  if (kind === "fail") toastEl.classList.add("fail");
  toastEl.offsetHeight;
  toastEl.classList.add("show");
  if (toastTimer) window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => toastEl.classList.remove("show"), ms);
}
toggleHelpBtn?.addEventListener("click", () => {
  const visible = helpEl && helpEl.style.display !== "none";
  if (helpEl) helpEl.style.display = visible ? "none" : "block";
});

function showWinBanner() {
  if (!winBannerEl) return;
  winBannerEl.classList.add("show");
}

const inventoryUI = document.getElementById("inv-items");
let keyCollected = false;

/** Updates inventory panel visually with icons */
function updateInventory() {
  let inv = document.getElementById("inv-items");

  // If the HUD or inventory isn't present (race with DOM ordering), create a minimal inventory UI
  if (!inv) {
    const hud = document.getElementById("hud") || document.body;
    // avoid duplicating
    if (!document.getElementById("inventory")) {
      const invWrap = document.createElement("div");
      invWrap.id = "inventory";
      invWrap.innerHTML = `<div id="inv-title">Inventory</div><div id="inv-items"></div>`;
      // ensure it sits on top
      invWrap.style.position = "absolute";
      invWrap.style.bottom = "12px";
      invWrap.style.left = "12px";
      invWrap.style.zIndex = "10000";
      hud.appendChild(invWrap);
    }
    inv = document.getElementById("inv-items");
    if (!inv) return;
  }

  inv.innerHTML = "";

  if (keyCollected) {
    const keyIcon = document.createElement("div");
    keyIcon.className = "inv-icon";
    keyIcon.textContent = "🔑";
    keyIcon.setAttribute("role", "img");
    keyIcon.style.display = "flex";
    keyIcon.style.alignItems = "center";
    keyIcon.style.justifyContent = "center";
    keyIcon.style.fontSize = "28px";
    inv.appendChild(keyIcon);
  }
}

// HUD text for each room
function setHUDRoom1() {
  if (helpEl) {
    helpEl.innerHTML = `
      <div style="font-weight:700;margin-bottom:6px;">Room 1 – Crate & Key</div>
      <div><kbd>W</kbd>/<kbd>A</kbd>/<kbd>S</kbd>/<kbd>D</kbd> move the sphere</div>
      <div><kbd>Space</kbd> to jump</div>
      <div style="margin-top:6px">Push the blue cube to its goal to reveal the end platforms.</div>
      <div style="margin-top:4px">Click the gold key to collect it for Room 2.</div>
    `;
  }
  if (footerHintEl) {
    footerHintEl.textContent = "Falling off resets you to Room 1 start.";
  }
}

function setHUDRoom2() {
  if (helpEl) {
    helpEl.innerHTML = `
      <div style="font-weight:700;margin-bottom:6px;">Room 2 – Power Circuit</div>
      <div><kbd>W</kbd>/<kbd>A</kbd>/<kbd>S</kbd>/<kbd>D</kbd> move the sphere</div>
      <div><kbd>Space</kbd> to jump</div>
      <div style="margin-top:6px">Use your key on the power box (click it).</div>
      <div style="margin-top:4px">Then activate the plate (click it). When both are active, the bridge appears.</div>
    `;
  }
  if (footerHintEl) {
    footerHintEl.textContent = "Falling off respawns you in Room 2.";
  }
}

setHUDRoom1();

// touchscreen joystick handling
const joy = document.getElementById("touch-joystick");
const knob = document.getElementById("touch-joystick-knob");

let joyActive = false;
let joyStartX = 0;
let joyStartY = 0;

if (joy && knob) {
  joy.addEventListener(
    "touchstart",
    (e) => {
      e.preventDefault(); // keep touches on the joystick, don’t scroll
      const t = e.touches[0];
      joyActive = true;
      joyStartX = t.clientX;
      joyStartY = t.clientY;
    },
    { passive: false }
  );

  joy.addEventListener(
    "touchmove",
    (e) => {
      if (!joyActive) return;
      e.preventDefault();

      const t = e.touches[0];

      const dx = t.clientX - joyStartX;
      const dy = t.clientY - joyStartY;

      // limit joystick radius
      const dist = Math.min(Math.sqrt(dx * dx + dy * dy), 40);
      const angle = Math.atan2(dy, dx);

      knob.style.transform =
        `translate(${Math.cos(angle) * dist}px, ${Math.sin(angle) * dist}px)`;

      // @ts-ignore
      keys["w"] = dy < -10;
      // @ts-ignore
      keys["s"] = dy > 10;
      // @ts-ignore
      keys["a"] = dx < -10;
      // @ts-ignore
      keys["d"] = dx > 10;
    },
    { passive: false }
  );

  joy.addEventListener("touchend", () => {
    joyActive = false;
    knob.style.transform = "translate(0,0)";

    // @ts-ignore
    keys["w"] = keys["a"] = keys["s"] = keys["d"] = false;
  });
} else {
  window.addEventListener("touchend", () => {
    // @ts-ignore
    keys["w"] = keys["a"] = keys["s"] = keys["d"] = false;
  });
}

// touch jump button handling (calls tryJump on press)
const jumpBtn = document.getElementById("touch-jump");
if (jumpBtn) {
  const onJump = (e) => {
    if (e && typeof e.preventDefault === "function") e.preventDefault();
    tryJump();
    jumpBtn.classList.add("active");
    setTimeout(() => jumpBtn.classList.remove("active"), 180);
  };
  jumpBtn.addEventListener("touchstart", onJump, { passive: false });
  jumpBtn.addEventListener("pointerdown", onJump);
}

let lastTap = 0;

window.addEventListener("touchstart", () => {
  const now = Date.now();
  if (now - lastTap < 250) {
    tryJump();
  }
  lastTap = now;
});

// basic Scene Setup
const scene = new THREE.Scene();
scene.background = new THREE.Color(0xa8d0ff);

const camera = new THREE.PerspectiveCamera(
  75,
  window.innerWidth / window.innerHeight,
  0.1,
  1000
);
camera.position.set(5, 5, 10);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
document.body.appendChild(renderer.domElement);

try {
  const hudEl = document.getElementById("hud");
  if (hudEl) document.body.appendChild(hudEl);
} catch (e) {
  // ignore
}

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.enabled = false;

//click handling
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();
let keyMesh = null;

// room 2 power/plate/bridge meshes + flags
/** @type {THREE.Mesh | null} */
let powerboxInactive = null;
/** @type {THREE.Mesh | null} */
let powerboxActive = null;
/** @type {THREE.Mesh | null} */
let plateInactive = null;
/** @type {THREE.Mesh | null} */
let plateActive = null;
/** @type {THREE.Mesh | null} */
let bridgeMesh = null;
/** @type {THREE.Mesh | null} */
let endgoal = null;
let powerActivated = false;
let plateActivated = false;

// lights
const ambientLight = new THREE.AmbientLight(0xffffff, 0.9);
scene.add(ambientLight);

const sunLight = new THREE.DirectionalLight(0xffffff, 1);
sunLight.position.set(10, 20, 10);
sunLight.castShadow = true;
sunLight.shadow.bias = -0.0005;
scene.add(sunLight);

// visual themes
let isDarkMode = false; // current theme

const THEMES = {
  light: {
    name: 'light',
    bg: 0xa8d0ff,
    fog: 0xa8d0ff,
    ambientColor: 0xffffff,
    // toned-down daylight to avoid blown-out highlights
    ambientIntensity: 0.55,
    sunColor: 0xfff3d9,
    sunIntensity: 0.7,
    sunPos: new THREE.Vector3(10, 20, 10),
    uiBg: 'rgba(255,255,255,0.92)',
    uiColor: '#111111',
    savePointColor: 0x0077ff
  },
  dark: {
    name: 'dark',
    bg: 0x0b1220,
    fog: 0x09101a,
    ambientColor: 0x7f8ea3,
    // subtle night settings
    ambientIntensity: 0.18,
    sunColor: 0x9fbfff,
    sunIntensity: 0.18,
    sunPos: new THREE.Vector3(-5, 10, -5),
    uiBg: 'rgba(16,18,26,0.9)',
    uiColor: '#ffffff',
    savePointColor: 0x33ff66
  }
};

function applyTheme(themeName) {
  const theme = THEMES[themeName] || THEMES.light;
  isDarkMode = themeName === 'dark';

  // background and fog 
  try {
    scene.background = new THREE.Color(theme.bg);
  } catch (e) {
    console.warn('Theme bg apply failed, keeping existing background', e);
  }
  try {
    scene.fog = new THREE.Fog(theme.fog, 10, 80);
  } catch (e) {
    console.warn('Theme fog apply failed', e);
  }

  // ambient and sun
  ambientLight.color.setHex(theme.ambientColor);
  ambientLight.intensity = theme.ambientIntensity;

  sunLight.color.setHex(theme.sunColor);
  sunLight.intensity = theme.sunIntensity;
  sunLight.position.copy(theme.sunPos);

  // UI root styling
  try {
    if (typeof uiRoot !== 'undefined' && uiRoot) {
      uiRoot.style.background = theme.uiBg;
      uiRoot.style.color = theme.uiColor;
    }
  } catch (e) {
    console.warn('Failed to style UI root for theme', e);
  }

  // update savepoint markers color
  try {
    savePoints.forEach(sp => {
      if (!sp.visual || !sp.visual.material) return;
      sp.visual.material.color.setHex(theme.savePointColor);
    });
  } catch (e) {}

  // update debug wireframes color (green->brighter/dimmer)
  debugBodies.forEach(({ mesh }) => {
    try {
      mesh.material.color.setHex(isDarkMode ? 0x66ff99 : 0x00ff00);
    } catch (e) {
      // ignore
    }
  });

  console.log('🌗 Theme applied:', themeName, 'bg:', theme.bg, 'fog:', theme.fog, 'ambient:', theme.ambientIntensity, 'sun:', theme.sunIntensity);
}

// theme application control
let THEME_ENABLED = true; // set false to disable

let currentThemeName = 'light';
let targetThemeName = 'light';
let themeTransition = {
  active: false,
  start: 0,
  duration: 800, 
  from: null,
  to: null
};

function themeSnapshotFrom(name) {
  const th = THEMES[name] || THEMES.light;
  return {
    bg: new THREE.Color(th.bg),
    fog: new THREE.Color(th.fog),
    ambientColor: new THREE.Color(th.ambientColor),
    ambientIntensity: th.ambientIntensity,
    sunColor: new THREE.Color(th.sunColor),
    sunIntensity: th.sunIntensity,
    sunPos: th.sunPos.clone(),
  };
}

function startThemeTransition(toName, duration = 800) {
  if (!THEME_ENABLED) { applyTheme(toName); currentThemeName = toName; return; }
  const now = performance.now();
  themeTransition.active = true;
  themeTransition.start = now;
  themeTransition.duration = duration;
  themeTransition.from = {
    bg: scene.background ? scene.background.clone() : new THREE.Color(0xa8d0ff),
    fog: scene.fog ? new THREE.Color(scene.fog.color) : new THREE.Color(0xa8d0ff),
    ambientColor: ambientLight.color.clone(),
    ambientIntensity: ambientLight.intensity,
    sunColor: sunLight.color.clone(),
    sunIntensity: sunLight.intensity,
    sunPos: sunLight.position.clone()
  };
  themeTransition.to = themeSnapshotFrom(toName);
  targetThemeName = toName;
}

// detect and respond to system/browser color scheme 
function detectAndApplySystemTheme() {
  if (!THEME_ENABLED) return;
  const mq = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)');
  const prefersDark = mq ? mq.matches : false;
  startThemeTransition(prefersDark ? 'dark' : 'light', 700);
  if (mq && typeof mq.addEventListener === 'function') {
    mq.addEventListener('change', (e) => startThemeTransition(e.matches ? 'dark' : 'light', 700));
  } else if (mq && typeof mq.addListener === 'function') {
    // fallback
    mq.addListener((e) => startThemeTransition(e.matches ? 'dark' : 'light', 700));
  }
}

if (!THEME_ENABLED) {
  try {
    scene.background = new THREE.Color(0xa8d0ff);
    scene.fog = null;
    ambientLight.color.setHex(0xffffff);
    ambientLight.intensity = 0.9;
    sunLight.color.setHex(0xffffff);
    sunLight.intensity = 1.0;
    sunLight.position.set(10, 20, 10);

    try { uiRoot.style.background = 'rgba(0,0,0,0.45)'; uiRoot.style.color = '#fff'; } catch (e) {}
  } catch (e) {
    console.warn('Failed to apply safe defaults when themes disabled', e);
  }
} else {
  detectAndApplySystemTheme();
}

//goal Platform
let goalPlatform = null;
let nextSceneLoaded = false;

//second map
let currentMap = null;
let currentStartPoint = null;

//Checkpoints
let checkpointBody = null;
let checkpointMesh = null;
/** @type {THREE.Mesh<any, any, any>[]} */
let checkpointMeshes = [];

let lastCheckpointX = null;
let lastCheckpointY = null;
let lastCheckpointZ = null;

// physics World
const world = new CANNON.World({
  gravity: new CANNON.Vec3(0, -15, 0),
});
world.broadphase = new CANNON.SAPBroadphase(world);
world.allowSleep = true;
// @ts-ignore
world.solver.iterations = 20;
// @ts-ignore
world.solver.tolerance = 1e-3;

// physics Materials
const physicsMaterial = new CANNON.Material("physics");
const contactMaterial = new CANNON.ContactMaterial(
  physicsMaterial,
  physicsMaterial,
  {
    friction: 0.9,
    restitution: 0.0,
  }
);
world.addContactMaterial(contactMaterial);

const playerPhysicsMaterial = new CANNON.Material("player");
const boxPhysicsMaterial = new CANNON.Material("box");
const playerBoxContact = new CANNON.ContactMaterial(
  playerPhysicsMaterial,
  boxPhysicsMaterial,
  {
    friction: 0.0,
    restitution: 0.0,
  }
);
world.addContactMaterial(playerBoxContact);
const boxGroundContact = new CANNON.ContactMaterial(
  boxPhysicsMaterial,
  physicsMaterial,
  {
    friction: 0.9,
    restitution: 0.0,
  }
);
world.addContactMaterial(boxGroundContact);

// debug visualization
/**
 * @type {{ mesh: THREE.Mesh<THREE.BoxGeometry, THREE.MeshBasicMaterial, THREE.Object3DEventMap>; body: any; }[]}
 */
const debugBodies = [];
let spawnAdjusted = false;
let mapMinY = -50;
let lastResetTime = 0;

// save system with autosave
const SAVE_KEY = 'cmpm-game-saves-v1';
const MAX_SAVE_SLOTS = 3;
let saveSlots = new Array(MAX_SAVE_SLOTS).fill(null); 
let lastSaveSlot = null; 
let lastAutoSaveSlot = null;
let autosaveEnabled = true;
const AUTOSAVE_INTERVAL_MS = 15000; 
let autosaveTimer = null;

let savePoints = []; 

function loadSavesFromStorage() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return;
    const obj = JSON.parse(raw);
    if (!obj || !obj.slots) return;
    saveSlots = obj.slots.map(s => s || null).slice(0, MAX_SAVE_SLOTS);
    lastSaveSlot = typeof obj.lastSaveSlot === 'number' ? obj.lastSaveSlot : null;
    lastAutoSaveSlot = typeof obj.lastAutoSaveSlot === 'number' ? obj.lastAutoSaveSlot : null;
    autosaveEnabled = !!obj.autosaveEnabled;
    console.log('💾 Loaded save meta from storage:', {lastSaveSlot, lastAutoSaveSlot, autosaveEnabled});
  } catch (e) {
    console.warn('Failed to read saves from storage', e);
  }
}

function persistSavesToStorage() {
  try {
    const obj = { slots: saveSlots, lastSaveSlot, lastAutoSaveSlot, autosaveEnabled };
    localStorage.setItem(SAVE_KEY, JSON.stringify(obj));
  } catch (e) {
    console.warn('Failed to persist saves', e);
  }
}

function makeSaveSnapshot(label) {
  const snapshot = {
    label: label || `Save ${new Date().toLocaleTimeString()}`,
    timestamp: Date.now(),
    player: null,
    puzzle: null,
    solved: false
  };

  if (playerBody) {
    snapshot.player = {
      pos: { x: playerBody.position.x, y: playerBody.position.y, z: playerBody.position.z },
      vel: { x: playerBody.velocity.x, y: playerBody.velocity.y, z: playerBody.velocity.z }
    };
  }

  if (puzzleBody) {
    snapshot.puzzle = {
      pos: { x: puzzleBody.position.x, y: puzzleBody.position.y, z: puzzleBody.position.z },
      vel: { x: puzzleBody.velocity.x, y: puzzleBody.velocity.y, z: puzzleBody.velocity.z }
    };
  }

  // record whether puzzle was solved (end platforms visible)
  snapshot.solved = endMeshes.length > 0 && endMeshes[0].visible;
  return snapshot;
}

function saveToSlot(slotIndex, label) {
  if (slotIndex < 0 || slotIndex >= MAX_SAVE_SLOTS) return false;
  const snapshot = makeSaveSnapshot(label || `Slot ${slotIndex + 1}`);
  saveSlots[slotIndex] = snapshot;
  lastSaveSlot = slotIndex;
  persistSavesToStorage();
  renderSaveUI();
  console.log('💾 Saved to slot', slotIndex, snapshot);
  return true;
}

function autosaveToLastSlot() {
  if (!autosaveEnabled) return;
  const slot = lastSaveSlot !== null ? lastSaveSlot : 0;
  const ok = saveToSlot(slot, `Auto ${new Date().toLocaleTimeString()}`);
  if (ok) lastAutoSaveSlot = slot;
  persistSavesToStorage();
}

function loadFromSlot(slotIndex) {
  if (slotIndex < 0 || slotIndex >= MAX_SAVE_SLOTS) return false;
  const snap = saveSlots[slotIndex];
  if (!snap) return false;

  // apply player state
  if (snap.player && playerBody) {
    playerBody.position.set(snap.player.pos.x, snap.player.pos.y, snap.player.pos.z);
    playerBody.velocity.set(snap.player.vel.x, snap.player.vel.y, snap.player.vel.z);
    playerMesh.position.copy(playerBody.position);
    if (typeof playerBody.wakeUp === 'function') playerBody.wakeUp();
  }

  // apply puzzle state
  if (snap.puzzle && puzzleBody) {
    puzzleBody.position.set(snap.puzzle.pos.x, snap.puzzle.pos.y, snap.puzzle.pos.z);
    puzzleBody.velocity.set(snap.puzzle.vel.x || 0, snap.puzzle.vel.y || 0, snap.puzzle.vel.z || 0);
    puzzleBody.angularVelocity.set(0, 0, 0);
    if (puzzleMesh) puzzleMesh.position.copy(puzzleBody.position);
    if (typeof puzzleBody.wakeUp === 'function') puzzleBody.wakeUp();
  }

  // apply solved state
  if (typeof snap.solved === 'boolean') {
    endMeshes.forEach(m => (m.visible = snap.solved));
  }

  lastSaveSlot = slotIndex;
  lastResetTime = performance.now();
  console.log('📥 Loaded slot', slotIndex, snap);
  renderSaveUI();
  return true;
}

function deleteSlot(slotIndex) {
  if (slotIndex < 0 || slotIndex >= MAX_SAVE_SLOTS) return false;
  saveSlots[slotIndex] = null;
  if (lastSaveSlot === slotIndex) lastSaveSlot = null;
  if (lastAutoSaveSlot === slotIndex) lastAutoSaveSlot = null;
  persistSavesToStorage();
  renderSaveUI();
  return true;
}

// save UI
const uiRoot = document.createElement('div');
uiRoot.style.position = 'fixed';
uiRoot.style.right = '8px';
uiRoot.style.top = '8px';
uiRoot.style.zIndex = 9999;
uiRoot.style.background = 'rgba(0,0,0,0.45)';
uiRoot.style.padding = '8px';
uiRoot.style.borderRadius = '6px';
uiRoot.style.color = 'white';
uiRoot.style.fontFamily = 'monospace';
uiRoot.style.fontSize = '12px';
uiRoot.style.minWidth = '220px';
document.body.appendChild(uiRoot);
// initialize saves UI from localStorage and start autosave ticking
loadSavesFromStorage();
renderSaveUI();
if (autosaveTimer) clearInterval(autosaveTimer);
autosaveTimer = setInterval(() => { autosaveToLastSlot(); }, AUTOSAVE_INTERVAL_MS);
try { if (THEME_ENABLED) applyTheme(isDarkMode ? 'dark' : 'light'); } catch (e) {}

const statusEl = document.createElement('div');
statusEl.style.fontSize = '11px';
statusEl.style.opacity = '0.9';
statusEl.style.marginTop = '6px';
uiRoot.appendChild(statusEl);

window.addEventListener('beforeunload', () => {
  try {
    autosaveToLastSlot();
  } catch (e) {}
});
document.addEventListener('visibilitychange', () => { if (document.hidden) { try { autosaveToLastSlot(); } catch (e) {} } });

function renderSaveUI() {
  uiRoot.innerHTML = '';
  const title = document.createElement('div');
  title.textContent = '💾 Saves';
  title.style.fontWeight = '700';
  title.style.marginBottom = '6px';
  uiRoot.appendChild(title);

  const autosaveRow = document.createElement('div');
  autosaveRow.style.display = 'flex';
  autosaveRow.style.alignItems = 'center';
  autosaveRow.style.justifyContent = 'space-between';
  autosaveRow.style.marginBottom = '6px';
  autosaveRow.innerHTML = `<div style="opacity:0.9">Auto-save</div>`;
  const toggle = document.createElement('input');
  toggle.type = 'checkbox';
  toggle.checked = autosaveEnabled;
  toggle.addEventListener('change', () => { autosaveEnabled = toggle.checked; persistSavesToStorage(); renderSaveUI(); });
  autosaveRow.appendChild(toggle);
  uiRoot.appendChild(autosaveRow);

  // theme controls
  const themeRow = document.createElement('div');
  themeRow.style.display = 'flex';
  themeRow.style.alignItems = 'center';
  themeRow.style.justifyContent = 'space-between';
  themeRow.style.marginBottom = '6px';
  themeRow.innerHTML = `<div style="opacity:0.9">Theme</div>`;
  const themeToggle = document.createElement('input');
  themeToggle.type = 'checkbox';
  themeToggle.checked = !!THEME_ENABLED;
  themeToggle.addEventListener('change', () => {
    THEME_ENABLED = themeToggle.checked;
    if (THEME_ENABLED) startThemeTransition(currentThemeName || 'light', 600);
    else applyTheme('light');
    renderSaveUI();
  });
  themeRow.appendChild(themeToggle);
  uiRoot.appendChild(themeRow);

  // manual theme buttons
  const themeBtns = document.createElement('div');
  themeBtns.style.display = 'flex';
  themeBtns.style.gap = '6px';
  themeBtns.style.marginBottom = '8px';
  const btnLight = document.createElement('button');
  btnLight.textContent = 'Light';
  btnLight.onclick = () => { startThemeTransition('light', 700); };
  const btnDark = document.createElement('button');
  btnDark.textContent = 'Dark';
  btnDark.onclick = () => { startThemeTransition('dark', 700); };
  themeBtns.appendChild(btnLight);
  themeBtns.appendChild(btnDark);
  uiRoot.appendChild(themeBtns);

  for (let i = 0; i < MAX_SAVE_SLOTS; ++i) {
    const row = document.createElement('div');
    row.style.display = 'flex';
    row.style.alignItems = 'center';
    row.style.gap = '6px';
    row.style.marginBottom = '4px';

    const label = document.createElement('div');
    label.style.flex = '1';
    label.style.whiteSpace = 'nowrap';
    label.style.overflow = 'hidden';
    label.style.textOverflow = 'ellipsis';
    const slot = saveSlots[i];
    label.textContent = slot ? `${i+1}: ${slot.label} (${new Date(slot.timestamp).toLocaleTimeString()})` : `${i+1}: (empty)`;
    if (lastSaveSlot === i) label.style.color = '#ffd966';
    row.appendChild(label);

    const btnSave = document.createElement('button');
    btnSave.textContent = 'Save';
    btnSave.onclick = () => saveToSlot(i);
    row.appendChild(btnSave);

    const btnLoad = document.createElement('button');
    btnLoad.textContent = 'Load';
    btnLoad.onclick = () => loadFromSlot(i);
    btnLoad.disabled = !slot;
    row.appendChild(btnLoad);

    const btnDel = document.createElement('button');
    btnDel.textContent = 'Del';
    btnDel.onclick = () => deleteSlot(i);
    btnDel.disabled = !slot;
    row.appendChild(btnDel);

    uiRoot.appendChild(row);
  }

  // quick load last autosave
  const quickRow = document.createElement('div');
  quickRow.style.display = 'flex';
  quickRow.style.justifyContent = 'space-between';
  quickRow.style.marginTop = '6px';
  const btnLoadAuto = document.createElement('button');
  btnLoadAuto.textContent = 'Load last autosave';
  btnLoadAuto.onclick = () => { if (typeof lastAutoSaveSlot === 'number') loadFromSlot(lastAutoSaveSlot); };
  quickRow.appendChild(btnLoadAuto);

  const btnClearAll = document.createElement('button');
  btnClearAll.textContent = 'Clear saves';
  btnClearAll.onclick = () => { if (confirm('Clear all saves?')) { saveSlots = new Array(MAX_SAVE_SLOTS).fill(null); lastSaveSlot = null; lastAutoSaveSlot = null; persistSavesToStorage(); renderSaveUI(); } };
  quickRow.appendChild(btnClearAll);

  uiRoot.appendChild(quickRow);
}

// helper: try to auto-load autosave at map load 
function tryAutoLoad() {
  if (!autosaveEnabled) return;
  if (typeof lastAutoSaveSlot === 'number') {
    console.log('🔁 Auto-loading last autosave slot', lastAutoSaveSlot);
    loadFromSlot(lastAutoSaveSlot);
  } else if (typeof lastSaveSlot === 'number') {
    // fallback: restore last save
    console.log('🔁 Auto-loading last manual save slot', lastSaveSlot);
    loadFromSlot(lastSaveSlot);
  }
}

/**
 * @param {CANNON.Body} body
 */
function addDebugVisualization(body) {
  // debug visualization disabled in production — no-op to avoid green wireframes
  return;
}

/**
 * @param {{ name: string; geometry: { computeBoundingBox: () => void; boundingBox: { clone: () => any; }; } | undefined; updateWorldMatrix: (arg0: boolean, arg1: boolean) => void; matrixWorld: THREE.Matrix4; userData: { colliderBody: CANNON.Body; }; }} mesh
 */
// @ts-ignore
function createPhysicsBody(mesh) {
  const lname = mesh.name.toLowerCase();
  if (
    lname.includes("box") ||
    lname.includes("cylinder") ||
    mesh.geometry === undefined
  ) {
    console.log("⏭ Skipping:", mesh.name);
    return;
  }

  mesh.geometry.computeBoundingBox();
  const localBox = mesh.geometry.boundingBox.clone();
  const localSize = new THREE.Vector3();
  localBox.getSize(localSize);
  const localCenter = new THREE.Vector3();
  localBox.getCenter(localCenter);

  mesh.updateWorldMatrix(true, true);
  const worldPos = new THREE.Vector3();
  const worldQuat = new THREE.Quaternion();
  const worldScale = new THREE.Vector3();
  mesh.matrixWorld.decompose(worldPos, worldQuat, worldScale);

  const worldCenter = localCenter.clone().applyMatrix4(mesh.matrixWorld);
  const scaledSize = new THREE.Vector3(
    localSize.x * worldScale.x,
    localSize.y * worldScale.y,
    localSize.z * worldScale.z
  );

  const halfExtents = new CANNON.Vec3(
    Math.abs(scaledSize.x) / 2,
    Math.abs(scaledSize.y) / 2,
    Math.abs(scaledSize.z) / 2
  );
  const shape = new CANNON.Box(halfExtents);

  const body = new CANNON.Body({
    mass: 0,
    material: physicsMaterial,
    shape: shape,
  });

  body.position.set(worldCenter.x, worldCenter.y, worldCenter.z);
  // @ts-ignore
  body.quaternion.copy(worldQuat);
  body.type = CANNON.Body.STATIC;

  world.addBody(body);

  try {
    mesh.userData.colliderBody = body;
  } catch (e) {
    // ignore
  }

  addDebugVisualization(body);
}

/**
 * @param {THREE.Mesh<any, any, any>} mesh
 */
function createHiddenPathCollider(mesh) {
  try {
    if (!mesh.geometry) return null;

    // compute local bbox
    mesh.geometry.computeBoundingBox();
    const localBox = mesh.geometry.boundingBox.clone();
    const localSize = new THREE.Vector3();
    localBox.getSize(localSize);
    const localCenter = new THREE.Vector3();
    localBox.getCenter(localCenter);

    // world transform
    mesh.updateWorldMatrix(true, true);
    const worldPos = new THREE.Vector3();
    const worldQuat = new THREE.Quaternion();
    const worldScale = new THREE.Vector3();
    mesh.matrixWorld.decompose(worldPos, worldQuat, worldScale);

    // center in world space
    const worldCenter = localCenter.clone().applyMatrix4(mesh.matrixWorld);

    const scaledSize = new THREE.Vector3(
      Math.abs(localSize.x * worldScale.x),
      Math.abs(localSize.y * worldScale.y),
      Math.abs(localSize.z * worldScale.z)
    );

    const PAD = 0.02;
    const MIN_HALF_XZ = 0.05;
    const MIN_HALF_Y = 0.25;

    const halfX = Math.max(MIN_HALF_XZ, scaledSize.x * 0.5 + PAD);
    const halfY = Math.max(MIN_HALF_Y, scaledSize.y * 0.5 + PAD);
    const halfZ = Math.max(MIN_HALF_XZ, scaledSize.z * 0.5 + PAD);

    const shape = new CANNON.Box(new CANNON.Vec3(halfX, halfY, halfZ));
    const body = new CANNON.Body({
      mass: 0,
      shape,
      material: physicsMaterial,
    });

    body.position.set(worldCenter.x, worldCenter.y, worldCenter.z);
    body.quaternion.set(worldQuat.x, worldQuat.y, worldQuat.z, worldQuat.w);
    body.type = CANNON.Body.STATIC;
    body.collisionResponse = true;

    world.addBody(body);
    body.updateAABB();

    mesh.userData.pathCollider = body;

    // debug
    addDebugVisualization(body);

    return body;
  } catch (e) {
    console.warn("Failed to create hidden path collider for", mesh.name, e);
    return null;
  }
}

// @ts-ignore
let platformBodies = [];

// load blender Map
const loader = new GLTFLoader();
/**
 * @type {THREE.Object3D<THREE.Object3DEventMap> | null}
 */
let cubeStart = null;
/**
 * @type {THREE.Mesh<any, any, any> | null}
 */
let cubeEnd = null;
/**
 * @type {THREE.Mesh<any, any, any>[]}
 */
const endMeshes = [];
/**
 * @type {THREE.Object3D<THREE.Object3DEventMap> | null}
 */
let puzzleMesh = null;
/**
 * @type {CANNON.Body | null}
 */
let puzzleBody = null;
/**
 * @type {THREE.Object3D<THREE.Object3DEventMap>}
 */
let startPoint;
loader.load(
  `${import.meta.env.BASE_URL}models/121F1.glb`,
  (gltf) => {
    const map = gltf.scene;
    scene.add(map);

    try {
      const mapBox = new THREE.Box3().setFromObject(map);
      if (!mapBox.isEmpty()) mapMinY = mapBox.min.y;
      console.log("Map min Y =", mapMinY);
    } catch (e) {
      console.warn("Failed to compute map bounds", e);
    }

    console.log("Model loaded successfully!");

    map.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        if (child.geometry === undefined) return;
        child.castShadow = child.receiveShadow = true;

        createHiddenPathCollider(child);

        // detect savepoint meshes by name (e.g. 'save', 'save1', 'savepoint')
        if ((child.name || '').toLowerCase().includes('save')) {
          let slotIndex = null;
          const n = (child.name || '').toLowerCase();
          const m = n.match(/save\s*(\d+)/) || n.match(/save(\d+)/);
          if (m) slotIndex = Math.max(0, Math.min(MAX_SAVE_SLOTS - 1, parseInt(m[1], 10) - 1));
          if (slotIndex === null) {
            for (let i = 0; i < MAX_SAVE_SLOTS; ++i) {
              const occupied = savePoints.some(sp => sp.slotIndex === i);
              if (!occupied) { slotIndex = i; break; }
            }
            if (slotIndex === null) slotIndex = 0;
          }

          const wb = new THREE.Box3().setFromObject(child);
          const center = wb.getCenter(new THREE.Vector3());
          const sphereGeo = new THREE.SphereGeometry(0.25, 12, 12);
          const spColor = isDarkMode ? THEMES.dark.savePointColor : THEMES.light.savePointColor;
          const sphereMat = new THREE.MeshStandardMaterial({ color: spColor, transparent: true, opacity: 0.9 });
          const marker = new THREE.Mesh(sphereGeo, sphereMat);
          marker.position.copy(center);
          scene.add(marker);

          savePoints.push({ name: child.name || 'save', slotIndex, pos: center.clone(), visual: marker, activatedAt: 0 });
          console.log('🔖 Found savepoint:', child.name, '-> slot', slotIndex + 1);
        }

        const n = (child.name || "").toLowerCase();
        if (n === "start" || child.name === "start") {
          startPoint = child;
        }
        if (n === "cubestart" || child.name === "cubestart") {
          cubeStart = child;
        }
        if (n === "cubeend" || child.name === "cubeend") {
          cubeEnd = child;
        }
        if (
          child.name === "end1" ||
          child.name === "end2" ||
          child.name === "end3" ||
          child.name === "end4"
        ) {
          endMeshes.push(child);
          child.visible = false;
        }

        if (child.name && child.name.startsWith("col_")) child.visible = false;

        if (child.name === "goal") {
          goalPlatform = child;
        }

        if (child.name === "key") {
          console.log("Found key platform:", child.name);

          const box = new THREE.Box3().setFromObject(child);
          const top = box.max;

          const keyGeo = new THREE.BoxGeometry(0.3, 0.1, 0.7);
          const keyMat = new THREE.MeshStandardMaterial({ color: 0xffd700 });

          keyMesh = new THREE.Mesh(keyGeo, keyMat);
          keyMesh.castShadow = true;
          keyMesh.receiveShadow = true;

          keyMesh.position.set(
            (box.min.x + box.max.x) / 2,
            top.y + 0.3,
            (box.min.z + box.max.z) / 2
          );

          scene.add(keyMesh);
          console.log("Spawned key mesh!");
        }

        if (n === "cubestart" || n === "cubeend") {
          // mark room1 checkpoints (cubestart and cubeend)
          checkpointMeshes.push(child);
          // keep singular reference for legacy uses (if any)
          if (!checkpointMesh) {
            checkpointMesh = child;
            checkpointBody = child.userData?.pathCollider || null;
          }
        }
      }
    });

    try {
      const colliders = [];
      map.traverse((c) => {
        if (c.userData && c.userData.pathCollider)
          colliders.push({
            name: c.name,
            pos: c.userData.pathCollider.position,
            halfExtents:
              c.userData.pathCollider.shapes &&
              c.userData.pathCollider.shapes[0] &&
              c.userData.pathCollider.shapes[0].halfExtents,
          });
      });
      console.log(
        `Map traversal complete. Created ${colliders.length} hidden colliders.`
      );
    } catch (e) {
      console.warn("Failed to enumerate colliders", e);
    }

    if (cubeStart) {
      spawnPuzzleBoxAt(cubeStart);
    } else {
      showToast("No cubestart — box not spawned", "fail");
      console.warn("cubestart not found — puzzle box not spawned.");
    }

    if (startPoint) {
      const startWorldPos = new THREE.Vector3();
      startPoint.getWorldPosition(startWorldPos);
      playerBody.position.set(
        startWorldPos.x,
        startWorldPos.y + 2,
        startWorldPos.z
      );
      playerMesh.position.copy(playerBody.position);
      showToast("Spawned at start", "info", 900);
    } else {
      console.warn("start point not found, player remains at default spawn.");
    }

    // attempt to auto-load a saved game state if available (autosave or last manual save)
    tryAutoLoad();
  },
  undefined,
  (err) => {
    console.error("GLB load error:", err);
    showToast("Model load failed", "fail");
  }
);

// global restart helper
function restartGame() {
  showToast("Restarting...", "info", 800);

  // small delay so the toast can show before reload
  setTimeout(() => {
    window.location.reload();
  }, 300);
}

function loadNextScene() {
  nextSceneLoaded = true;

  showToast("Loading next room...", "success", 1300);

  const keepObjects = [camera, playerMesh, sunLight, ambientLight];

  // clear any room-specific checkpoints when switching rooms
  checkpointMeshes = [];
  checkpointMesh = null;
  checkpointBody = null;
  lastCheckpointX = null;
  lastCheckpointY = null;
  lastCheckpointZ = null;

  const objectsToRemove = [];
  scene.children.forEach((obj) => {
    if (!keepObjects.includes(obj) && obj.type !== "HemisphereLight") {
      objectsToRemove.push(obj);
    }
  });
  objectsToRemove.forEach((obj) => scene.remove(obj));

  world.bodies.forEach((body) => {
    if (body !== playerBody) {
      world.removeBody(body);
    }
  });

  // reset puzzle references
  puzzleBody = null;
  puzzleMesh = null;
  cubeStart = null;
  cubeEnd = null;
  goalPlatform = null;

  // reset power/plate flags/meshes
  powerboxInactive = null;
  powerboxActive = null;
  plateInactive = null;
  plateActive = null;
  bridgeMesh = null;
  endgoal = null;
  powerActivated = false;
  plateActivated = false;

  // load second map
  loader.load(
    `${import.meta.env.BASE_URL}models/121F2.glb`,
    (gltf) => {
      const map = gltf.scene;
      currentMap = map;
      map.scale.set(0.5, 0.5, 0.5);
      scene.add(map);

      showToast("Entered room 2!", "success", 1600);

      currentStartPoint = null;

      map.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          child.castShadow = child.receiveShadow = true;

          // Build colliders for room 2
          createHiddenPathCollider(child);

          const name = (child.name || "").toLowerCase();

          if (name === "start2") {
            currentStartPoint = child;
          }

          if (name === "powerbox_inactive") {
            powerboxInactive = child;
          }
          if (name === "powerbox_active") {
            powerboxActive = child;
          }
          if (name === "plate_inactive") {
            plateInactive = child;
          }
          if (name === "plate_active") {
            plateActive = child;
          }
          if (name === "bridge") {
            bridgeMesh = child;
          }
          if (name === "end") {
            endgoal = child;
          }

          // 🔧 Treat BOTH inactive and active plate as checkpoints in room 2
          if (name === "plate_inactive" || name === "plate_active") {
            checkpointMeshes.push(child);
            if (!checkpointMesh) {
              checkpointMesh = child;
              checkpointBody = child.userData?.pathCollider || null;
            }
          }
        }
      });

      // initial visibility for room 2 props
      if (powerboxActive) powerboxActive.visible = false;
      if (powerboxInactive) powerboxInactive.visible = true;
      if (plateActive) plateActive.visible = false;
      if (plateInactive) plateInactive.visible = true;
      if (bridgeMesh) bridgeMesh.visible = false;
      powerActivated = false;
      plateActivated = false;
      level2Won = false;
      if (winBannerEl) winBannerEl.classList.remove("show");

      if (currentStartPoint) {
        const wp = new THREE.Vector3();
        currentStartPoint.getWorldPosition(wp);

        playerBody.position.set(wp.x, wp.y + 2, wp.z);
        playerBody.velocity.set(0, 0, 0);
        playerMesh.position.copy(playerBody.position);

        showToast("Spawned in room 2!", "info", 1000);
      } else {
        console.warn("⚠ No 'start2' found in 121F2.glb");
      }

      try {
        const box2 = new THREE.Box3().setFromObject(map);
        if (!box2.isEmpty()) mapMinY = box2.min.y;
        console.log("Room2 mapMinY =", mapMinY);
      } catch (e) {
        console.warn("Could not compute mapMinY for room 2");
      }

      // swap HUD to room2 text
      setHUDRoom2();
    },
    undefined,
    () => showToast("Failed to load room 2", "fail")
  );
}

// helper: reveal bridge when both active
function tryRevealBridge() {
  if (powerActivated && plateActivated && bridgeMesh && !bridgeMesh.visible) {
    bridgeMesh.visible = true;
    showToast("A bridge appears…", "success", 1800);
  }
}

// player Sphere
const radius = 0.5;
const playerShape = new CANNON.Sphere(radius);
const playerBody = new CANNON.Body({
  mass: 1,
  shape: playerShape,
  position: new CANNON.Vec3(0, 10, 0),
  material: playerPhysicsMaterial,
  linearDamping: 0.4,
  angularDamping: 0.6,
  // @ts-ignore
  restitution: 0.0,
});
world.addBody(playerBody);

const playerGeometry = new THREE.SphereGeometry(radius, 32, 32);
const playerMaterial = new THREE.MeshStandardMaterial({ color: 0xff5555 });
const playerMesh = new THREE.Mesh(playerGeometry, playerMaterial);
playerMesh.castShadow = playerMesh.receiveShadow = true;
scene.add(playerMesh);

// Movement
const keys = {};
window.addEventListener("keydown", (e) => {
  const k = e.key.toLowerCase();
  // @ts-ignore
  keys[k] = true;

  if (e.code === "Space") {
    tryJump();
  }

  // global restart: press R to go back to level 1 with fresh state
  if (k === "r") {
    restartGame();
    return;
  }

  // debug room 1 skip
  if (k === "n" && !nextSceneLoaded) {
    // mark key as collected
    if (!keyCollected) {
      keyCollected = true;
      if (keyMesh) {
        scene.remove(keyMesh);
        keyMesh = null;
      }
      updateInventory();
      showToast("🔑 Key auto-collected (debug).", "info", 900);
    }

    // go to room 2, debug only
    nextSceneLoaded = true;
    showToast("Skipping to Room 2…", "success", 1200);
    loadNextScene();
  }
});

window.addEventListener("keyup", (e) => {
  // @ts-ignore
  keys[e.key.toLowerCase()] = false;
});

playerBody.addEventListener(
  "collide",
  (/** @type {{ contact: any; }} */ e) => {
    const contact = e.contact;
    const normal = contact.ni.clone();

    if (contact.bi === playerBody) {
      normal.negate();
    }

    if (normal.y > 0.5) {
      // grounded
    }
  }
);

function tryJump() {
  const onGround = Math.abs(playerBody.velocity.y) < 0.2;
  if (!onGround) return;

  const vy = playerBody.velocity.y;
  if (Math.abs(vy) < 0.4) {
    const jumpSpeed = 6;
    playerBody.velocity.y = jumpSpeed;
    showToast("Jump!", "info", 500);
  }
}

function handleMovement() {
  const forceMagnitude = 5;

  const camForward = new THREE.Vector3();
  camera.getWorldDirection(camForward);
  camForward.y = 0;
  camForward.normalize();

  const camRight = new THREE.Vector3();
  camRight.crossVectors(camForward, new THREE.Vector3(0, 1, 0)).normalize();

  const fForward = new CANNON.Vec3(
    camForward.x * forceMagnitude,
    0,
    camForward.z * forceMagnitude
  );
  const fBackward = new CANNON.Vec3(
    -camForward.x * forceMagnitude,
    0,
    -camForward.z * forceMagnitude
  );
  const fRight = new CANNON.Vec3(
    camRight.x * forceMagnitude,
    0,
    camRight.z * forceMagnitude
  );
  const fLeft = new CANNON.Vec3(
    -camRight.x * forceMagnitude,
    0,
    -camRight.z * forceMagnitude
  );

  const onGround = Math.abs(playerBody.velocity.y) < 0.2;
  if (!onGround) {
    const maxAirSpeed = 8;
    playerBody.velocity.x = Math.max(
      -maxAirSpeed,
      Math.min(maxAirSpeed, playerBody.velocity.x)
    );
    playerBody.velocity.z = Math.max(
      -maxAirSpeed,
      Math.min(maxAirSpeed, playerBody.velocity.z)
    );
    return;
  }

  // @ts-ignore
  const anyInput = keys["w"] || keys["a"] || keys["s"] || keys["d"];
  if (!anyInput) {
    playerBody.velocity.x = 0;
    playerBody.velocity.z = 0;
    return;
  }

  // @ts-ignore
  if (keys["w"]) playerBody.applyForce(fForward, playerBody.position);
  // @ts-ignore
  if (keys["s"]) playerBody.applyForce(fBackward, playerBody.position);
  // @ts-ignore
  if (keys["a"]) playerBody.applyForce(fLeft, playerBody.position);
  // @ts-ignore
  if (keys["d"]) playerBody.applyForce(fRight, playerBody.position);

  const maxSpeed = 5; // lower speed cap
  playerBody.velocity.x = Math.max(
    -maxSpeed,
    Math.min(maxSpeed, playerBody.velocity.x)
  );
  playerBody.velocity.z = Math.max(
    -maxSpeed,
    Math.min(maxSpeed, playerBody.velocity.z)
  );
  // handle pushing the puzzle box
  if (puzzleBody) {
    const px = playerBody.position.x;
    const pz = playerBody.position.z;
    const bx = puzzleBody.position.x;
    const bz = puzzleBody.position.z;
    const dx = bx - px;
    const dz = bz - pz;
    const horizDist = Math.sqrt(dx * dx + dz * dz);

    const pushThreshold = radius + 0.5 + 0.2;
    if (horizDist <= pushThreshold) {
      const moveDir = new THREE.Vector3();
      // @ts-ignore
      if (keys["w"]) moveDir.add(camForward);
      // @ts-ignore
      if (keys["s"]) moveDir.sub(camForward);
      // @ts-ignore
      if (keys["d"]) moveDir.add(camRight);
      // @ts-ignore
      if (keys["a"]) moveDir.sub(camRight);

      if (moveDir.lengthSq() > 0.001) {
        moveDir.normalize();

        const playerSpeed = Math.sqrt(
          playerBody.velocity.x * playerBody.velocity.x +
            playerBody.velocity.z * playerBody.velocity.z
        );
        const speedFactor = Math.max(0.35, Math.min(1.0, playerSpeed / 4));

        const basePush = 10; // softer
        const pushForce = basePush * speedFactor;

        const contactPoint = new CANNON.Vec3(
          puzzleBody.position.x,
          puzzleBody.position.y - 0.35,
          puzzleBody.position.z
        );

        const push = new CANNON.Vec3(
          moveDir.x * pushForce,
          0,
          moveDir.z * pushForce
        );
        puzzleBody.applyForce(push, contactPoint);

        playerBody.velocity.scale(0.9, playerBody.velocity);
        puzzleBody.velocity.scale(0.995, puzzleBody.velocity);
      }
    }
  }
}

// SpawnBox
/**
 * @param {THREE.Object3D<THREE.Object3DEventMap>} targetMesh
 */
function spawnPuzzleBoxAt(targetMesh) {
  const worldBox = new THREE.Box3().setFromObject(targetMesh);
  const center = worldBox.getCenter(new THREE.Vector3());

  const platformTopY = worldBox.max.y;

  const geo = new THREE.BoxGeometry(1, 1, 1);
  const mat = new THREE.MeshStandardMaterial({ color: 0x00aaff });
  puzzleMesh = new THREE.Mesh(geo, mat);
  puzzleMesh.castShadow = true;
  puzzleMesh.receiveShadow = true;
  scene.add(puzzleMesh);

  const half = new CANNON.Vec3(0.5, 0.5, 0.5);
  const shape = new CANNON.Box(half);

  puzzleBody = new CANNON.Body({
    mass: 0.025,
    shape: shape,
    material: boxPhysicsMaterial,
    position: new CANNON.Vec3(center.x, platformTopY + half.y + 1.5, center.z),
  });

  puzzleBody.linearDamping = 0.4;
  puzzleBody.angularDamping = 1.0;
  puzzleBody.collisionResponse = true;
  puzzleBody.fixedRotation = true;
  puzzleBody.updateMassProperties();

  world.addBody(puzzleBody);

  puzzleMesh.position.copy(puzzleBody.position);
  puzzleMesh.quaternion.copy(puzzleBody.quaternion);
}

// reset helpers
function resetPlayerToStart() {
  if (!startPoint) {
    console.warn(
      "resetPlayerToStart: startPoint not found, using fallback spawn"
    );
    const fallbackX = 0;
    const fallbackY = 10;
    const fallbackZ = 0;
    playerBody.position.set(fallbackX, fallbackY, fallbackZ);
    playerBody.velocity.set(0, 0, 0);
    playerBody.angularVelocity.set(0, 0, 0);
    if (typeof playerBody.wakeUp === "function") playerBody.wakeUp();
    playerMesh.position.copy(playerBody.position);
    spawnAdjusted = true;
    lastResetTime = performance.now();
    showToast("Reset (fallback)", "fail");
    return;
  }

  const worldPos = new THREE.Vector3();
  startPoint.getWorldPosition(worldPos);

  let spawnY = worldPos.y + 2;
  const collider = startPoint.userData && startPoint.userData.colliderBody;
  if (collider && collider.shapes && collider.shapes[0] instanceof CANNON.Box) {
    const halfY = collider.shapes[0].halfExtents.y;
    spawnY = collider.position.y + halfY + radius + 0.1;
  } else {
    const bbox = new THREE.Box3().setFromObject(startPoint);
    if (!bbox.isEmpty()) spawnY = bbox.max.y + radius + 0.1;
  }

  playerBody.position.set(worldPos.x, spawnY, worldPos.z);
  playerBody.velocity.set(0, 0, 0);
  playerBody.angularVelocity.set(0, 0, 0);
  if (typeof playerBody.wakeUp === "function") playerBody.wakeUp();
  playerMesh.position.copy(playerBody.position);
  spawnAdjusted = true;
  lastResetTime = performance.now();
  showToast("💥 You fell! Resetting…", "fail");
}

function resetPlayer() {
  if (lastCheckpointY !== null) {
    playerBody.position.set(lastCheckpointX, lastCheckpointY, lastCheckpointZ);
    playerBody.velocity.set(0, 0, 0);
    playerMesh.position.copy(playerBody.position);
    showToast("Respawned at checkpoint!", "info");
    return;
  }

  // fallback: spawn at the appropriate room start
  if (nextSceneLoaded && currentStartPoint) {
    resetPlayerToStart2();
  } else {
    resetPlayerToStart();
  }
}

function resetPuzzleToStart() {
  if (!cubeStart || !puzzleBody) return;
  const worldBox = new THREE.Box3().setFromObject(cubeStart);
  const center = worldBox.getCenter(new THREE.Vector3());
  const platformTopY = worldBox.max.y;
  const half = new CANNON.Vec3(0.5, 0.5, 0.5);

  puzzleBody.position.set(center.x, platformTopY + half.y + 1.5, center.z);
  puzzleBody.velocity.set(0, 0, 0);
  puzzleBody.angularVelocity.set(0, 0, 0);
  if (typeof puzzleBody.wakeUp === "function") puzzleBody.wakeUp();
  if (puzzleMesh) puzzleMesh.position.copy(puzzleBody.position);
  lastResetTime = performance.now();
  showToast("Cube reset", "fail", 900);
}

// check if puzzle is solved
function checkPuzzleSolved() {
  if (!puzzleBody || !cubeEnd) return;

  const puzzlePos = puzzleBody.position;
  const endPos = new THREE.Vector3();
  cubeEnd.getWorldPosition(endPos);

  const dx = puzzlePos.x - endPos.x;
  const dy = puzzlePos.y - endPos.y;
  const dz = puzzlePos.z - endPos.z;
  const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);

  if (dist < 1.5) {
    endMeshes.forEach((m) => (m.visible = true));
    showToast("🎉 Puzzle solved! End platforms revealed.", "success", 2000);
  }
}

function resetPlayerToStart2() {
  if (!currentStartPoint) return;

  const wp = new THREE.Vector3();
  currentStartPoint.getWorldPosition(wp);

  playerBody.position.set(wp.x, wp.y + 2, wp.z);
  playerBody.velocity.set(0, 0, 0);
  playerBody.angularVelocity.set(0, 0, 0);

  if (typeof playerBody.wakeUp === "function") playerBody.wakeUp();
  playerMesh.position.copy(playerBody.position);

  lastResetTime = performance.now();
  showToast("Respawned in Room 2!", "fail");
}

// animation Loop
const clock = new THREE.Clock();
const camOffset = new THREE.Vector3(10, 5, 0); // rotated 90° to the right of the player
const followPos = new THREE.Vector3();

function animate() {
  requestAnimationFrame(animate);

  const delta = clock.getDelta();

  if (startPoint && !spawnAdjusted) {
    const worldPos = new THREE.Vector3();
    startPoint.getWorldPosition(worldPos);

    let spawnY = worldPos.y + 2; // fallback
    const collider = startPoint.userData && startPoint.userData.colliderBody;
    if (collider && collider.shapes && collider.shapes[0] instanceof CANNON.Box) {
      const halfY = collider.shapes[0].halfExtents.y;
      spawnY = collider.position.y + halfY + radius + 0.1;
    } else {
      const bbox = new THREE.Box3().setFromObject(startPoint);
      if (!bbox.isEmpty()) {
        spawnY = bbox.max.y + radius + 0.1;
      }
    }

    playerBody.position.set(worldPos.x, spawnY, worldPos.z);
    playerBody.velocity.set(0, 0, 0);
    if (typeof playerBody.wakeUp === "function") playerBody.wakeUp();
    playerMesh.position.copy(playerBody.position);
    spawnAdjusted = true;
    showToast("Spawn adjusted", "info", 700);
  }

  world.step(1 / 60, delta, 10);

  handleMovement();

  playerMesh.position.copy(playerBody.position);
  playerMesh.quaternion.copy(playerBody.quaternion);

  debugBodies.forEach(({ mesh, body }) => {
    mesh.position.copy(body.position);
    mesh.quaternion.copy(body.quaternion);
  });

  followPos.copy(playerMesh.position).add(camOffset);
  camera.position.lerp(followPos, 0.1);
  camera.lookAt(playerMesh.position);

  if (puzzleBody && puzzleMesh) {
    puzzleMesh.position.copy(puzzleBody.position);
    puzzleMesh.quaternion.copy(puzzleBody.quaternion);
  }

  // respawn logic: if player or puzzle falls far below the map, reset them to their starts
  const now = performance.now();
  const resetCooldown = 500; // ms
  if (now - lastResetTime > resetCooldown) {
    const fallThreshold = mapMinY - 5;

    if (playerBody.position.y < fallThreshold) {
      // Prefer respawning at a checkpoint if available, otherwise at the room start
      resetPlayer();
    }

    if (!nextSceneLoaded && puzzleBody && puzzleBody.position.y < fallThreshold) {
      resetPuzzleToStart();
    }
  }

  checkPuzzleSolved();

  if (goalPlatform && !nextSceneLoaded) {
    const box = new THREE.Box3().setFromObject(goalPlatform);
    const center = box.getCenter(new THREE.Vector3());

    const dist = center.distanceTo(playerMesh.position);

    if (dist < 2.0) {
      nextSceneLoaded = true;
      showToast("Loading next scene...", "success", 1500);
      loadNextScene();
    }
  }

  // respawn player when falling
  if (currentStartPoint) {
    const now2 = performance.now();

    if (now2 - lastResetTime > 500 && playerBody.position.y < mapMinY - 5) {
      resetPlayer();
    }
  }

  // win detection: Level 2 complete when reaching "end" mesh
  if (nextSceneLoaded && endgoal && !level2Won) {
    const endBox = new THREE.Box3().setFromObject(endgoal);
    const endCenter = endBox.getCenter(new THREE.Vector3());
    const distEnd = endCenter.distanceTo(playerMesh.position);

    if (distEnd < 1.5) {
      level2Won = true;
      showToast("🎉 You cleared Level 2! Press R to restart the game.", "success", 2500);
      showWinBanner();
    }
  }

  // 🔧 Updated checkpoint logic: use world-space box center for respawn coords
  if (checkpointMeshes && checkpointMeshes.length > 0) {
    const playerPos = playerMesh.position;
    for (let i = 0; i < checkpointMeshes.length; i++) {
      const cp = checkpointMeshes[i];
      if (!cp) continue;

      const cpBox = new THREE.Box3().setFromObject(cp);
      if (cpBox.isEmpty()) continue;

      const topY = cpBox.max.y;
      const horizPad = 0.6;          // allow standing slightly off-center
      const verticalHeight = 1.8;    // how high above the platform counts

      const topBox = new THREE.Box3(
        new THREE.Vector3(
          cpBox.min.x - horizPad,
          topY,
          cpBox.min.z - horizPad
        ),
        new THREE.Vector3(
          cpBox.max.x + horizPad,
          topY + verticalHeight,
          cpBox.max.z + horizPad
        )
      );

      if (topBox.containsPoint(playerPos)) {
        // world-space center of the checkpoint mesh
        const cpCenter = cpBox.getCenter(new THREE.Vector3());

        const newX = cpCenter.x;
        const newY = cpBox.max.y + 1.5; // spawn a bit above the top
        const newZ = cpCenter.z;

        const changed =
          lastCheckpointY === null ||
          lastCheckpointX !== newX ||
          lastCheckpointY !== newY ||
          lastCheckpointZ !== newZ;

        lastCheckpointX = newX;
        lastCheckpointY = newY;
        lastCheckpointZ = newZ;

        if (changed) {
          showToast("Checkpoint saved", "info", 900);
        }

        break;
      }
    }

    // Savepoint proximity check (auto-save to designated slot when player reaches a savepoint)
    if (savePoints && savePoints.length > 0) {
      const nowSp = performance.now();
      const px = playerMesh.position;
      for (let i = 0; i < savePoints.length; i++) {
        const sp = savePoints[i];
        if (!sp || !sp.pos) continue;
        const dist = sp.pos.distanceTo(px);
        const threshold = 1.2;
        if (dist < threshold && nowSp - (sp.activatedAt || 0) > 1200) {
          // save to that slot
          saveToSlot(sp.slotIndex, `Savepoint ${sp.name || ''}`);
          lastAutoSaveSlot = sp.slotIndex;
          persistSavesToStorage();
          sp.activatedAt = nowSp;
          // animate marker (brief color change)
          if (sp.visual && sp.visual.material) {
            const mat = sp.visual.material;
            const old = mat.color.clone();
            mat.color.set(0x33ff66);
            setTimeout(() => { try { mat.color.copy(old); } catch (e) {} }, 600);
          }
          showToast(`Saved at ${sp.name || 'checkpoint'}`, 'success', 900);
        }
      }
    }
  }

  // update small status diagnostics
  try {
    if (statusEl) {
      statusEl.textContent = `theme=${isDarkMode ? 'dark' : 'light'} | sceneObjs=${scene.children.length} | physBodies=${world.bodies.length}`;
    }
  } catch (e) {}

  // Theme transition updates (smooth crossfade)
  try {
    if (THEME_ENABLED && themeTransition.active) {
      const nowT = performance.now();
      const elapsed = nowT - themeTransition.start;
      let t = Math.min(1, Math.max(0, elapsed / themeTransition.duration));

      // lerp colors and values
      const bg = new THREE.Color();
      bg.lerpColors(themeTransition.from.bg, themeTransition.to.bg, t);
      scene.background = bg;

      // fog
      try {
        scene.fog = new THREE.Fog(new THREE.Color().lerpColors(themeTransition.from.fog, themeTransition.to.fog, t), 10, 80);
      } catch (e) {}

      ambientLight.color.lerpColors(themeTransition.from.ambientColor, themeTransition.to.ambientColor, t);
      ambientLight.intensity = themeTransition.from.ambientIntensity + (themeTransition.to.ambientIntensity - themeTransition.from.ambientIntensity) * t;

      sunLight.color.lerpColors(themeTransition.from.sunColor, themeTransition.to.sunColor, t);
      sunLight.intensity = themeTransition.from.sunIntensity + (themeTransition.to.sunIntensity - themeTransition.from.sunIntensity) * t;
      sunLight.position.lerpVectors(themeTransition.from.sunPos, themeTransition.to.sunPos, t);

      // debug saved theme progress
      if (t >= 1) {
        themeTransition.active = false;
        currentThemeName = targetThemeName;
        // ensure final values exact
        applyTheme(currentThemeName);
      }
    }
  } catch (e) {
    // don't let theme transition crash the frame
    console.warn('Theme transition error', e);
    themeTransition.active = false;
  }

  renderer.render(scene, camera);
}

// click handling
window.addEventListener("pointerdown", (event) => {
  mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
  mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;

  raycaster.setFromCamera(mouse, camera);

  // key collection
  if (!keyCollected && keyMesh) {
    const hits = raycaster.intersectObject(keyMesh);
    if (hits.length > 0) {
      // require the player be near/on top of the key to collect it
      const px = playerBody.position.x;
      const pz = playerBody.position.z;
      const kx = keyMesh.position.x;
      const kz = keyMesh.position.z;
      const ky = keyMesh.position.y;
      const py = playerBody.position.y;

      const horizDist = Math.hypot(kx - px, kz - pz);
      const vertDist = Math.abs(ky - py);
      const PICKUP_HORIZ_DIST = 1.2; // meters
      const PICKUP_VERT_DIST = 1.5; // meters

      if (horizDist <= PICKUP_HORIZ_DIST && vertDist <= PICKUP_VERT_DIST) {
        keyCollected = true;
        scene.remove(keyMesh);
        keyMesh = null;
        updateInventory();
        showToast("🔑 Key collected!", "success", 1300);
        return;
      } else {
        showToast("Move closer to the key to pick it up", "info", 1100);
        // do not return here; allow other click handlers to run
      }
    }
  }

  // room 2 interactions
  if (nextSceneLoaded) {
    if (powerboxInactive && !powerActivated) {
      const hits = raycaster.intersectObject(powerboxInactive, true);
      if (hits.length > 0) {
        if (!keyCollected) {
          showToast("You need a key to activate this.", "fail", 1400);
        } else {
          powerActivated = true;
          powerboxInactive.visible = false;
          if (powerboxActive) powerboxActive.visible = true;
          showToast("⚡ Power box activated!", "success", 1600);
          tryRevealBridge();
        }
        return;
      }
    }

    // plate inactive click
    if (plateInactive && !plateActivated) {
      const hits = raycaster.intersectObject(plateInactive, true);
      if (hits.length > 0) {
        if (!powerActivated) {
          showToast("Activate the power box first.", "fail", 1400);
        } else {
          plateActivated = true;
          plateInactive.visible = false;
          if (plateActive) plateActive.visible = true;
          showToast("Plate activated.", "success", 1400);
          tryRevealBridge();
        }
        return;
      }
    }
  }
});

animate();

// resize handling
window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});
