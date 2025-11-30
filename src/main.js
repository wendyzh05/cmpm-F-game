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
      background: rgba(0,0,0,.45);
      color: #fff;
      padding: 8px 12px;
      border-radius: 10px;
      font-size: 14px;
      pointer-events: none;
      backdrop-filter: blur(4px);
    }

    #inv-title {
      font-weight: 700;
      margin-bottom: 4px;
      font-size: 13px;
    }

    #inv-items {
      display: flex;
      gap: 6px;
    }

    .inv-item {
      width: 28px;
      height: 28px;
      background: rgba(255,255,255,0.15);
      border-radius: 6px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 18px;
      pointer-events: none;
    }
  `;
  document.head.appendChild(style);

  const hud = document.createElement("div");
  hud.id = "hud";
  hud.innerHTML = `
    <button id="toggleHelpBtn" aria-label="Toggle instructions">?</button>
    <div id="instructions" role="note">
      <div style="font-weight:700;margin-bottom:6px;">Controls</div>
      <div><kbd>W</kbd>/<kbd>A</kbd>/<kbd>S</kbd>/<kbd>D</kbd> move the sphere</div>
      <div><kbd>Space</kbd> to jump</div>
      <div style="margin-top:6px">Push the blue cube to its goal to reveal the end platforms.</div>
    </div>
    <div id="toast" aria-live="polite"></div>
    <div id="footerHint">Falling off resets you.</div>
    <div id="inventory">
      <div id="inv-title">Inventory</div>
      <div id="inv-items"></div>
    </div>
  `;
  document.body.appendChild(hud);
})();

const toastEl = /** @type {HTMLDivElement} */ (document.getElementById("toast"));
const helpEl = /** @type {HTMLDivElement} */ (document.getElementById("instructions"));
const toggleHelpBtn = /** @type {HTMLButtonElement} */ (document.getElementById("toggleHelpBtn"));
let toastTimer = /** @type {number|null} */ (null);

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
  // force reflow to retrigger transition
  // eslint-disable-next-line no-unused-expressions
  toastEl.offsetHeight;
  toastEl.classList.add("show");
  if (toastTimer) window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => toastEl.classList.remove("show"), ms);
}
toggleHelpBtn?.addEventListener("click", () => {
  const visible = helpEl && helpEl.style.display !== "none";
  if (helpEl) helpEl.style.display = visible ? "none" : "block";
});

function addToInventory(icon = "❓") {
  const slot = document.createElement("div");
  slot.className = "inv-item";
  slot.textContent = icon;
  document.getElementById("inv-items").appendChild(slot);
}

// Basic Scene Setup
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

// Move the HUD to the end of the body so it sits on top of the canvas (some browsers/DOM orders overlay the canvas)
try {
  const hudEl = document.getElementById('hud');
  if (hudEl) document.body.appendChild(hudEl);
} catch (e) {
  // ignore
}

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.enabled = false;

//Click handling
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();
let keyMesh = null;
let keyCollected = false;


// Lights
const ambientLight = new THREE.AmbientLight(0xffffff, 0.9);
scene.add(ambientLight);

const sunLight = new THREE.DirectionalLight(0xffffff, 1);
sunLight.position.set(10, 20, 10);
sunLight.castShadow = true;
sunLight.shadow.bias = -0.0005;
scene.add(sunLight);

//Goal Platform
let goalPlatform = null;
let nextSceneLoaded = false;

//Second map
let currentMap = null;
let currentStartPoint = null;

// Physics World
const world = new CANNON.World({
  gravity: new CANNON.Vec3(0, -15, 0),
});
world.broadphase = new CANNON.SAPBroadphase(world);
world.allowSleep = true;
// @ts-ignore
world.solver.iterations = 20;
// @ts-ignore
world.solver.tolerance = 1e-3;

// Physics Materials
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
    friction: 0.4,
    restitution: 0.0,
  }
);
world.addContactMaterial(boxGroundContact);

// Debug visualization
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
  // Debug visualization disabled in production — no-op to avoid green wireframes
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

// Load Blender Map
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
          child.visible = false; // hide until puzzle solved
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

function loadNextScene() {
    nextSceneLoaded = true;

    showToast("Loading next room...", "success", 1300);

    // Store references to objects we want to keep
    const keepObjects = [camera, playerMesh, sunLight, ambientLight];
    
    // Remove previous map, but keep camera, player, lights
    const objectsToRemove = [];
    scene.children.forEach((obj) => {
        if (!keepObjects.includes(obj) && obj.type !== "HemisphereLight") {
            objectsToRemove.push(obj);
        }
    });
    objectsToRemove.forEach(obj => scene.remove(obj));

    // Clear all physics bodies except player
    world.bodies.forEach((body) => {
        if (body !== playerBody) {
            world.removeBody(body);
        }
    });
    
    // Reset puzzle references since we're leaving map 1
    puzzleBody = null;
    puzzleMesh = null;
    cubeStart = null;
    cubeEnd = null;

    // Load second map
    loader.load(
        `${import.meta.env.BASE_URL}models/121F2.glb`,
        (gltf) => {
            const map = gltf.scene;
            currentMap = map;
            map.scale.set(0.5, 0.5, 0.5);
            scene.add(map);

            showToast("Entered room 2!", "success", 1600);

            currentStartPoint = null;

            // Scan objects
            map.traverse((child) => {
                if (child instanceof THREE.Mesh) {
                    child.castShadow = child.receiveShadow = true;

                    // Build colliders for room 2
                    const c = createHiddenPathCollider(child);

                    // Look for the start in 121F2.glb
                    if (child.name.toLowerCase() === "start2") {
                        currentStartPoint = child;
                    }
                }
            });

            // If start exists, move the player there
            if (currentStartPoint) {
                const wp = new THREE.Vector3();
                currentStartPoint.getWorldPosition(wp);

                playerBody.position.set(wp.x, wp.y + 2, wp.z);
                playerBody.velocity.set(0, 0, 0);
                playerMesh.position.copy(playerBody.position);

                showToast("Spawned in room 2!", "info", 1000);
            } else {
                console.warn("⚠ No 'start' found in 121F2.glb");
            }

            try {
                const box2 = new THREE.Box3().setFromObject(map);
                if (!box2.isEmpty()) mapMinY = box2.min.y;
                console.log("Room2 mapMinY =", mapMinY);
            } catch (e) {
                console.warn("Could not compute mapMinY for room 2");
            }
        },
        undefined,
        () => showToast("Failed to load room 2", "fail")
    );
}



// Player Sphere
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
  // @ts-ignore
  keys[e.key.toLowerCase()] = true;
  if (e.code === "Space") {
    tryJump();
  }
});
window.addEventListener("keyup", (e) => {
  // @ts-ignore
  keys[e.key.toLowerCase()] = false;
});

playerBody.addEventListener("collide", (/** @type {{ contact: any; }} */ e) => {
  const contact = e.contact;
  const normal = contact.ni.clone();

  if (contact.bi === playerBody) {
    normal.negate();
  }

  if (normal.y > 0.5) {
    // grounded
  }
});

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
// Handle pushing the puzzle box
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

        const basePush = 20; // tuned
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
    mass: 1,
    shape: shape,
    material: boxPhysicsMaterial,
    position: new CANNON.Vec3(center.x, platformTopY + half.y + 1.5, center.z),
  });

  puzzleBody.linearDamping = 0.2;
  puzzleBody.angularDamping = 0.9;
  puzzleBody.collisionResponse = true;

  world.addBody(puzzleBody);

  puzzleMesh.position.copy(puzzleBody.position);
  puzzleMesh.quaternion.copy(puzzleBody.quaternion);
}

// Reset helpers
function resetPlayerToStart() {
  if (!startPoint) {
    console.warn("resetPlayerToStart: startPoint not found, using fallback spawn");
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

// Check if puzzle is solved
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


// Animation Loop
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

  // Respawn logic: if player or puzzle falls far below the map, reset them to their starts
  const now = performance.now();
  const resetCooldown = 500; // ms
  if (now - lastResetTime > resetCooldown) {
    const fallThreshold = mapMinY - 5;

    if (playerBody.position.y < fallThreshold) {

        // If in room 2 → use start2
        if (nextSceneLoaded && currentStartPoint) {
            resetPlayerToStart2();
        }
        else {
            resetPlayerToStart();
        }
    }

    // Only reset the puzzle in room 1
    if (!nextSceneLoaded && puzzleBody && puzzleBody.position.y < fallThreshold) {
        resetPuzzleToStart();
    }
}


  checkPuzzleSolved();

  if (goalPlatform && !nextSceneLoaded) {
    const playerPos = playerBody.position;

    const box = new THREE.Box3().setFromObject(goalPlatform);
    const center = box.getCenter(new THREE.Vector3());

    const dist = center.distanceTo(playerMesh.position);

    // adjust threshold based on size of platform
    if (dist < 2.0) {
        nextSceneLoaded = true;
        showToast("Loading next scene...", "success", 1500);
        loadNextScene();
    }
  }

  // Respawn player when falling, works for room 1 & room 2
  if (currentStartPoint) {
    const now = performance.now();

    if (now - lastResetTime > 500 && playerBody.position.y < mapMinY - 5) {
        resetPlayerToStart2();
    }
  }

  renderer.render(scene, camera);
}

window.addEventListener("pointerdown", (event) => {
  if (keyCollected || !keyMesh) return;

  // Normalize mouse pos
  mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
  mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;

  raycaster.setFromCamera(mouse, camera);
  const hits = raycaster.intersectObject(keyMesh);

  if (hits.length > 0) {
    // Collect key
    keyCollected = true;
    scene.remove(keyMesh);
    addToInventory("🔑");
    showToast("🔑 Key collected!", "success", 1300);
  }
});


animate();

// Resize handling
window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  //camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});
