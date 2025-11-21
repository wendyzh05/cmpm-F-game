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


// Debug visualization
const debugBodies = [];
let spawnAdjusted = false; 

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
    lname.includes("light") ||
    lname.includes("torus") ||
    mesh.geometry === undefined
  ) {
    console.log("⏭️ Skipping:", mesh.name);
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
    `✅ ${mesh.name}`,
    `\n   Position: (${worldCenter.x.toFixed(2)}, ${worldCenter.y.toFixed(2)}, ${worldCenter.z.toFixed(2)})`,
    `\n   HalfExtents: (${halfExtents.x.toFixed(2)}, ${halfExtents.y.toFixed(2)}, ${halfExtents.z.toFixed(2)})`,
    `\n   Scale: (${worldScale.x.toFixed(2)}, ${worldScale.y.toFixed(2)}, ${worldScale.z.toFixed(2)})`
  );

  addDebugVisualization(body);
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

    console.log("🎨 Model loaded successfully!");

    // traverse to create static colliders and find special objects
    map.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.castShadow = child.receiveShadow = true;
        createPhysicsBody(child);


        // find special named objects
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
        if (child.name === "end1" || child.name === "end2" || child.name === "end3") {
          endMeshes.push(child);
          child.visible = false; // hide until puzzle solved
          console.log("found end mesh:", child.name);
        }

        if (child.name && child.name.startsWith("col_")) child.visible = false;
      }
    });

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
  material: physicsMaterial,
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

  if (keys["w"]) playerBody.applyForce(fForward, playerBody.position);
  if (keys["s"]) playerBody.applyForce(fBackward, playerBody.position);
  if (keys["a"]) playerBody.applyForce(fLeft, playerBody.position);
  if (keys["d"]) playerBody.applyForce(fRight, playerBody.position);

  const maxSpeed = 5; // lower speed cap
  playerBody.velocity.x = Math.max(-maxSpeed, Math.min(maxSpeed, playerBody.velocity.x));
  playerBody.velocity.z = Math.max(-maxSpeed, Math.min(maxSpeed, playerBody.velocity.z));
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
    material: physicsMaterial,
    position: new CANNON.Vec3(
      center.x,
      platformTopY + half.y + 1.5, 
      center.z
    )
  });

  world.addBody(puzzleBody);

  puzzleMesh.position.copy(puzzleBody.position);
  puzzleMesh.quaternion.copy(puzzleBody.quaternion);

  console.log("📦 Puzzle box spawned:");
  console.log("   platform top Y:", platformTopY.toFixed(2));
  console.log("   box position:", puzzleBody.position);
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
