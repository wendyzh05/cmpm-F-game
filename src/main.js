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
  `;
  document.body.appendChild(hud);
})();

const toastEl = /** @type {HTMLDivElement} */ (document.getElementById("toast"));
const helpEl = /** @type {HTMLDivElement} */ (document.getElementById("instructions"));
const toggleHelpBtn = /** @type {HTMLButtonElement} */ (document.getElementById("toggleHelpBtn"));
const footerHintEl = /** @type {HTMLDivElement} */ (document.getElementById("footerHint"));
const winBannerEl = /** @type {HTMLDivElement} */ (document.getElementById("winBanner"));
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
          if (name === "plate_inactive") {
            // room2 checkpoint
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
        playerBody.velocity.set(0,0,0);
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

  if (checkpointMeshes && checkpointMeshes.length > 0) {
    const playerPos = playerMesh.position;
    for (let i = 0; i < checkpointMeshes.length; i++) {
      const cp = checkpointMeshes[i];
      if (!cp) continue;
      const cpBox = new THREE.Box3().setFromObject(cp);
      if (cpBox.isEmpty()) continue;

      // define a small volume on top of the platform where standing counts as a checkpoint
      const topY = cpBox.max.y;
      const horizPad = 0.6; // allow standing slightly off-center
      const verticalHeight = 1.8; // how high above the platform counts

      const topBox = new THREE.Box3(
        new THREE.Vector3(cpBox.min.x - horizPad, topY, cpBox.min.z - horizPad),
        new THREE.Vector3(cpBox.max.x + horizPad, topY + verticalHeight, cpBox.max.z + horizPad)
      );

      if (topBox.containsPoint(playerPos)) {
        const newX = cp.position.x;
        const newY = topY + 1.5;
        const newZ = cp.position.z;

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
