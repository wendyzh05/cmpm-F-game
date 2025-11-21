import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import * as CANNON from "cannon-es";

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

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.enabled = false;

// Lights
const ambientLight = new THREE.AmbientLight(0xffffff, 0.9);
scene.add(ambientLight);

const sunLight = new THREE.DirectionalLight(0xffffff, 1);
sunLight.position.set(10, 20, 10);
sunLight.castShadow = true;
sunLight.shadow.bias = -0.0005;
scene.add(sunLight);

// Physics World
const world = new CANNON.World({
  gravity: new CANNON.Vec3(0, -15, 0),
});
world.broadphase = new CANNON.SAPBroadphase(world);
world.allowSleep = true;
world.solver.iterations = 20;
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

// Separate materials for player and puzzle box so we can tune friction when they touch
const playerPhysicsMaterial = new CANNON.Material("player");
const boxPhysicsMaterial = new CANNON.Material("box");
const playerBoxContact = new CANNON.ContactMaterial(
  playerPhysicsMaterial,
  boxPhysicsMaterial,
  {
    friction: 0.0, // allow smooth sliding when player pushes box
    restitution: 0.0,
  }
);
world.addContactMaterial(playerBoxContact);
// Box-to-ground contact: allow sliding but keep some friction so the box doesn't glide forever
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
const debugBodies = [];
let spawnAdjusted = false; 
let mapMinY = -50; 
let lastResetTime = 0;

function addDebugVisualization(body) {
  const shape = body.shapes[0];
  if (shape instanceof CANNON.Box) {
    const geometry = new THREE.BoxGeometry(
      shape.halfExtents.x * 2,
      shape.halfExtents.y * 2,
      shape.halfExtents.z * 2
    );
    const material = new THREE.MeshBasicMaterial({
      color: 0x00ff00,
      wireframe: true,
    });
    const mesh = new THREE.Mesh(geometry, material);
    scene.add(mesh);
    mesh.position.copy(body.position);
    mesh.quaternion.copy(body.quaternion);
    debugBodies.push({ mesh, body });
  }
}

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
    )
  const shape = new CANNON.Box(halfExtents);

  const body = new CANNON.Body({
    mass: 0,
    material: physicsMaterial,
    shape: shape,
  });

  body.position.set(worldCenter.x, worldCenter.y, worldCenter.z);
  body.quaternion.copy(worldQuat);
  body.type = CANNON.Body.STATIC;

  world.addBody(body);

  try {
    mesh.userData.colliderBody = body;
  } catch (e) {
    // ignore
  }

  console.log(
    ` ${mesh.name}`,
    `\n   Position: (${worldCenter.x.toFixed(2)}, ${worldCenter.y.toFixed(2)}, ${worldCenter.z.toFixed(2)})`,
    `\n   HalfExtents: (${halfExtents.x.toFixed(2)}, ${halfExtents.y.toFixed(2)}, ${halfExtents.z.toFixed(2)})`,
    `\n   Scale: (${worldScale.x.toFixed(2)}, ${worldScale.y.toFixed(2)}, ${worldScale.z.toFixed(2)})`
  );

  addDebugVisualization(body);
}

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
    const MIN_HALF_Y  = 0.25;      

    const halfX = Math.max(MIN_HALF_XZ, scaledSize.x * 0.5 + PAD);
    const halfY = Math.max(MIN_HALF_Y,  scaledSize.y * 0.5 + PAD);
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

    // debug wireframe stays helpful
    addDebugVisualization(body);

    // dev log
    console.log(
      'Hidden collider:',
      mesh.name || '(unnamed)',
      'pos', body.position,
      'half', { x: halfX.toFixed(3), y: halfY.toFixed(3), z: halfZ.toFixed(3) }
    );

    return body;
  } catch (e) {
    console.warn('Failed to create hidden path collider for', mesh.name, e);
    return null;
  }
}

let platformBodies = [];

// Load Blender Map
const loader = new GLTFLoader();
let cubeStart = null;
let cubeEnd = null;
const endMeshes = [];
let puzzleMesh = null;
let puzzleBody = null;
let startPoint;
loader.load(
  "/models/121F1.glb",
  (gltf) => {
    const map = gltf.scene;
    scene.add(map);

    try {
      const mapBox = new THREE.Box3().setFromObject(map);
      if (!mapBox.isEmpty()) mapMinY = mapBox.min.y;
      console.log('Map min Y =', mapMinY);
    } catch (e) {
      console.warn('Failed to compute map bounds', e);
    }

    console.log(" Model loaded successfully!");

    map.traverse((child) => {
      if (child instanceof THREE.Mesh) {
          if (child.geometry === undefined) return;
          child.castShadow = child.receiveShadow = true;
          
          createHiddenPathCollider(child);

        const n = (child.name || "").toLowerCase();
        if (n === "start" || child.name === "start") {
          startPoint = child;
          console.log("found start:", child.name);
        }
        if (n === "cubestart" || child.name === "cubestart") {
          cubeStart = child;
          console.log("found cubestart");
        }
        if (n === "cubeend" || child.name === "cubeend") {
          cubeEnd = child;
          console.log("found cubeend");
        }
        if (child.name === "end1" || child.name === "end2" || child.name === "end3" || child.name === "end4") {
          endMeshes.push(child);
          child.visible = false; // hide until puzzle solved
          console.log("found end mesh:", child.name);
        }

        if (child.name && child.name.startsWith("col_")) child.visible = false;
      }
    });

    try {
      const colliders = [];
      map.traverse(c => { if (c.userData && c.userData.pathCollider) colliders.push({name: c.name, pos: c.userData.pathCollider.position, halfExtents: c.userData.pathCollider.shapes && c.userData.pathCollider.shapes[0] && c.userData.pathCollider.shapes[0].halfExtents}); });
      console.log(`Map traversal complete. Created ${colliders.length} hidden colliders.`);
      if (colliders.length > 0) console.table(colliders.map(c => ({name: c.name, x: c.pos.x.toFixed(2), y: c.pos.y.toFixed(2), z: c.pos.z.toFixed(2), hx: c.halfExtents.x.toFixed(2), hy: c.halfExtents.y.toFixed(2), hz: c.halfExtents.z.toFixed(2)})));
      console.log('Total physics bodies in world:', world.bodies.length);
    } catch (e) {
      console.warn('Failed to enumerate colliders', e);
    }

    if (cubeStart) {
      spawnPuzzleBoxAt(cubeStart);
    } else {
      console.warn("cubestart not found — puzzle box not spawned.");
    }

    if (startPoint) {
      const startWorldPos = new THREE.Vector3();
      startPoint.getWorldPosition(startWorldPos);
      playerBody.position.set(startWorldPos.x, startWorldPos.y + 2, startWorldPos.z);
      playerMesh.position.copy(playerBody.position);
      console.log("spawned player at start:", startWorldPos);
    } else {
      console.warn("start point not found, player remains at default spawn.");
    }

  }, undefined, (err) => {
    console.error("GLB load error:", err);
});

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
  restitution: 0.0
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
  keys[e.key.toLowerCase()] = true;
  if (e.code === "Space") {
    console.log("SPACE PRESSED");
    tryJump();
  }
})
window.addEventListener("keyup", (e) => {
  keys[e.key.toLowerCase()] = false;
});

playerBody.addEventListener("collide", (e) => {
  const contact = e.contact;
  const normal = contact.ni.clone();

  if (contact.bi === playerBody) {
    normal.negate();
  }

  if (normal.y > 0.5) {
    canJump = true;
    lastGroundTime = performance.now();
  }
});

function tryJump() {
  const onGround = Math.abs(playerBody.velocity.y) < 0.2;
  if (!onGround) return;

    const vy = playerBody.velocity.y;
    if (Math.abs(vy) < 0.4) {
      const jumpSpeed = 6;
      playerBody.velocity.y = jumpSpeed;
      console.log("⏫ Player jumped (vertical only)");
    }

  console.log("⏫ Vertical jump!");
}

function handleMovement() {
  const forceMagnitude = 5; 

  const camForward = new THREE.Vector3();
  camera.getWorldDirection(camForward);
  camForward.y = 0;
  camForward.normalize();

  const camRight = new THREE.Vector3();
  camRight.crossVectors(camForward, new THREE.Vector3(0, 1, 0)).normalize();

  const fForward = new CANNON.Vec3(camForward.x * forceMagnitude, 0, camForward.z * forceMagnitude);
  const fBackward = new CANNON.Vec3(-camForward.x * forceMagnitude, 0, -camForward.z * forceMagnitude);
  const fRight = new CANNON.Vec3(camRight.x * forceMagnitude, 0, camRight.z * forceMagnitude);
  const fLeft = new CANNON.Vec3(-camRight.x * forceMagnitude, 0, -camRight.z * forceMagnitude);

  const onGround = Math.abs(playerBody.velocity.y) < 0.2;
  if (!onGround) {
    const maxAirSpeed = 8;
    playerBody.velocity.x = Math.max(-maxAirSpeed, Math.min(maxAirSpeed, playerBody.velocity.x));
    playerBody.velocity.z = Math.max(-maxAirSpeed, Math.min(maxAirSpeed, playerBody.velocity.z));
    return;
  }

  const anyInput = keys["w"] || keys["a"] || keys["s"] || keys["d"];
  if (!anyInput) {
    playerBody.velocity.x = 0;
    playerBody.velocity.z = 0;
    return;
  }

  if (keys["w"]) playerBody.applyForce(fForward, playerBody.position);
  if (keys["s"]) playerBody.applyForce(fBackward, playerBody.position);
  if (keys["a"]) playerBody.applyForce(fLeft, playerBody.position);
  if (keys["d"]) playerBody.applyForce(fRight, playerBody.position);

  const maxSpeed = 5; // lower speed cap
  playerBody.velocity.x = Math.max(-maxSpeed, Math.min(maxSpeed, playerBody.velocity.x));
  playerBody.velocity.z = Math.max(-maxSpeed, Math.min(maxSpeed, playerBody.velocity.z));

  // If player is pushing against the puzzle box, apply a gentle push to the box
  if (puzzleBody) {
    const px = playerBody.position.x;
    const pz = playerBody.position.z;
    const bx = puzzleBody.position.x;
    const bz = puzzleBody.position.z;
    const dx = bx - px;
    const dz = bz - pz;
    const horizDist = Math.sqrt(dx * dx + dz * dz);

    // threshold: player radius + box half-width + small padding
    const pushThreshold = radius + 0.5 + 0.2;
    if (horizDist <= pushThreshold) {
      const moveDir = new THREE.Vector3();
      if (keys['w']) moveDir.add(camForward);
      if (keys['s']) moveDir.sub(camForward);
      if (keys['d']) moveDir.add(camRight);
      if (keys['a']) moveDir.sub(camRight);

      if (moveDir.lengthSq() > 0.001) {
        moveDir.normalize();

        // compute horizontal player speed to scale push strength
        const playerSpeed = Math.sqrt(playerBody.velocity.x * playerBody.velocity.x + playerBody.velocity.z * playerBody.velocity.z);
        const speedFactor = Math.max(0.35, Math.min(1.0, playerSpeed / 4));

        const basePush = 20; // base push strength; tuned for visible, smooth movement
        const pushForce = basePush * speedFactor;

        // apply force slightly below the center to reduce torque and keep box stable
        const contactPoint = new CANNON.Vec3(
          puzzleBody.position.x,
          puzzleBody.position.y - 0.35,
          puzzleBody.position.z
        );

        const push = new CANNON.Vec3(moveDir.x * pushForce, 0, moveDir.z * pushForce);
        puzzleBody.applyForce(push, contactPoint);

        // slightly damp player so it doesn't bounce; leave most of velocity intact
        playerBody.velocity.scale(0.9, playerBody.velocity);
        // reduce box small amount to avoid explosion of velocities
        puzzleBody.velocity.scale(0.995, puzzleBody.velocity);
      }
    }
  }
}

//SpawnBox
function spawnPuzzleBoxAt(targetMesh) {
  
  const worldBox = new THREE.Box3().setFromObject(targetMesh);
  const center = worldBox.getCenter(new THREE.Vector3());
  const size = worldBox.getSize(new THREE.Vector3());

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
    position: new CANNON.Vec3(
      center.x,
      platformTopY + half.y + 1.5, 
      center.z
    )
  });

  // Make the puzzle box respond smoothly to pushes: add damping and ensure collision response
  // moderate linear damping so the box moves but doesn't jitter; keep angular damping high
  puzzleBody.linearDamping = 0.2;
  puzzleBody.angularDamping = 0.9;
  puzzleBody.collisionResponse = true;

  world.addBody(puzzleBody);

  puzzleMesh.position.copy(puzzleBody.position);
  puzzleMesh.quaternion.copy(puzzleBody.quaternion);

  console.log("📦 Puzzle box spawned:");
  console.log("   platform top Y:", platformTopY.toFixed(2));
  console.log("   box position:", puzzleBody.position);
}

// Reset helpers
function resetPlayerToStart() {
  // If we don't have a start point (map may not define one), fall back to a safe default
  if (!startPoint) {
    console.warn('resetPlayerToStart: startPoint not found, using fallback spawn');
    const fallbackX = 0;
    const fallbackY = 10;
    const fallbackZ = 0;
    playerBody.position.set(fallbackX, fallbackY, fallbackZ);
    playerBody.velocity.set(0, 0, 0);
    playerBody.angularVelocity.set(0, 0, 0);
    if (typeof playerBody.wakeUp === 'function') playerBody.wakeUp();
    playerMesh.position.copy(playerBody.position);
    spawnAdjusted = true;
    lastResetTime = performance.now();
    console.log('↺ Player reset to fallback spawn');
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
  if (typeof playerBody.wakeUp === 'function') playerBody.wakeUp();
  playerMesh.position.copy(playerBody.position);
  spawnAdjusted = true;
  lastResetTime = performance.now();
  console.log('↺ Player reset to start');
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
  if (typeof puzzleBody.wakeUp === 'function') puzzleBody.wakeUp();
  if (puzzleMesh) puzzleMesh.position.copy(puzzleBody.position);
  lastResetTime = performance.now();
  console.log('↺ Puzzle box reset to cubestart');
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
    // Reveal end platforms
    endMeshes.forEach(m => (m.visible = true));
    console.log("🎉 Puzzle solved! End platforms revealed.");
  }
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
        console.log('🔧 Adjusting spawn to collider top at Y =', spawnY.toFixed(2));
      } else {
        const bbox = new THREE.Box3().setFromObject(startPoint);
        if (!bbox.isEmpty()) {
          spawnY = bbox.max.y + radius + 0.1;
          console.log('🔧 Adjusting spawn to bbox top at Y =', bbox.max.y.toFixed(2));
        }
      }

      playerBody.position.set(worldPos.x, spawnY, worldPos.z);
      playerBody.velocity.set(0, 0, 0);
      if (typeof playerBody.wakeUp === 'function') playerBody.wakeUp();
      playerMesh.position.copy(playerBody.position);
      spawnAdjusted = true;
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
    // Use a safe threshold: either below the map minimum or a reasonable world minimum
    const fallThreshold = Math.max(typeof mapMinY === 'number' ? mapMinY - 5 : -20, -20);
    if (playerBody.position.y < fallThreshold) {
      resetPlayerToStart();
    }
    if (puzzleBody && puzzleBody.position.y < fallThreshold) {
      resetPuzzleToStart();
    }
  }

  checkPuzzleSolved();

  renderer.render(scene, camera);
}

animate();

// Resize handling
window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});