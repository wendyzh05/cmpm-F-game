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
  gravity: new CANNON.Vec3(0, -9.82, 0),
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
    restitution: 0.0, // reduced bounce for more stability
  }
);
world.addContactMaterial(contactMaterial);
// Use this contact material as the default for all contacts to ensure consistent friction/restitution
world.defaultContactMaterial = contactMaterial;
// Increase solver iterations for more stable contact resolution
if (world.solver) {
  world.solver.iterations = 10;
  world.solver.tolerance = 0.001;
}

// Debug visualization
const debugBodies = [];

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
  // Skip decorative / thin / torus-ish meshes
  const lname = mesh.name.toLowerCase();
  if (
    lname.includes("start") ||
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

  console.log(
    `✅ ${mesh.name}`,
    `\n   Position: (${worldCenter.x.toFixed(2)}, ${worldCenter.y.toFixed(2)}, ${worldCenter.z.toFixed(2)})`,
    `\n   HalfExtents: (${halfExtents.x.toFixed(2)}, ${halfExtents.y.toFixed(2)}, ${halfExtents.z.toFixed(2)})`,
    `\n   Scale: (${worldScale.x.toFixed(2)}, ${worldScale.y.toFixed(2)}, ${worldScale.z.toFixed(2)})`
  );

  addDebugVisualization(body);
}

// Load Blender Map
const loader = new GLTFLoader();
let startPoint;
loader.load(
  "/models/121Final.glb",
  (gltf) => {
    const map = gltf.scene;
    scene.add(map);

    console.log("🎨 Model loaded successfully!");
    map.traverse((child) => {
      if (child.isMesh) {
        child.castShadow = child.receiveShadow = true;
        createPhysicsBody(child);
      }
    });

    startPoint = map.getObjectByName("start");
    if (!startPoint) {
      console.warn("❌ No object named 'start' found in Blender!");
    } else {
      console.log("✅ Found start point!");
      const worldPos = new THREE.Vector3();
      startPoint.getWorldPosition(worldPos);
    
      playerBody.linearDamping = 0.9;
      playerBody.position.set(worldPos.x, worldPos.y + 20, worldPos.z);
      playerMesh.position.copy(playerBody.position);
      console.log("🎮 Player spawned at:", worldPos);
    }
  },
  undefined,
  (err) => {
    console.error("Error loading GLB:", err);
  }
);

// Player Sphere
const radius = 1;
const playerShape = new CANNON.Sphere(radius);
const playerBody = new CANNON.Body({
  mass: 1,
  shape: playerShape,
  position: new CANNON.Vec3(0, 10, 0),
  material: physicsMaterial,
});
world.addBody(playerBody);

// Improve stability for the player body
playerBody.linearDamping = 0.9; // reduces sliding and post-collision bounce
playerBody.angularDamping = 0.9;
playerBody.collisionResponse = true;

// Clamp vertical velocity a bit on collision to avoid strong rebounds
playerBody.addEventListener && playerBody.addEventListener('collide', (e) => {
  // small heuristic: if hitting something and vertical speed is upwards (bounce), damp it
  const vy = playerBody.velocity.y;
  if (vy > 0.5) {
    playerBody.velocity.y = vy * 0.2; // reduce rebound to 20%
  }
});

const playerGeometry = new THREE.SphereGeometry(radius, 32, 32);
const playerMaterial = new THREE.MeshStandardMaterial({ color: 0xff5555 });
const playerMesh = new THREE.Mesh(playerGeometry, playerMaterial);
playerMesh.castShadow = playerMesh.receiveShadow = true;
scene.add(playerMesh);

// Movement
const keys = {};
window.addEventListener("keydown", (e) => {
  keys[e.key.toLowerCase()] = true;
  if (e.code === "Space") tryJump();
});
window.addEventListener("keyup", (e) => {
  keys[e.key.toLowerCase()] = false;
});

// Left-click drag to look around: enable OrbitControls while left mouse button is pressed
renderer.domElement.addEventListener('mousedown', (e) => {
  if (e.button === 0) { // left button
    isMouseDragging = true;
    controls.enabled = true;
    // Orbit around the player's current position
    controls.target.copy(playerMesh.position);
  }
});

window.addEventListener('mouseup', (e) => {
  if (e.button === 0 && isMouseDragging) {
    isMouseDragging = false;
    // preserve current offset so follow continues from the current camera pose
    camOffset.copy(camera.position).sub(playerMesh.position);
    controls.enabled = false;
  }
});

function tryJump() {
  const vy = playerBody.velocity.y;
  if (Math.abs(vy) < 0.4) {
    const jumpImpulse = new CANNON.Vec3(0, 6, 0);
    playerBody.applyImpulse(jumpImpulse, playerBody.position);
    console.log("⏫ Player jumped");
  }
}

function handleMovement() {
  const forceMagnitude = 10; // reduced from 20
  const forward = new CANNON.Vec3(0, 0, -forceMagnitude);
  const backward = new CANNON.Vec3(0, 0, forceMagnitude);
  const left = new CANNON.Vec3(-forceMagnitude, 0, 0);
  const right = new CANNON.Vec3(forceMagnitude, 0, 0);

  if (keys["w"]) playerBody.applyForce(forward, playerBody.position);
  if (keys["s"]) playerBody.applyForce(backward, playerBody.position);
  if (keys["a"]) playerBody.applyForce(left, playerBody.position);
  if (keys["d"]) playerBody.applyForce(right, playerBody.position);

  const maxSpeed = 10;
  playerBody.velocity.x = Math.max(-maxSpeed, Math.min(maxSpeed, playerBody.velocity.x));
  playerBody.velocity.z = Math.max(-maxSpeed, Math.min(maxSpeed, playerBody.velocity.z));
}

// Animation Loop
const clock = new THREE.Clock();
let camOffset = new THREE.Vector3(0, 5, 10); // mutable so we can preserve offset after manual look
const followPos = new THREE.Vector3();
let isMouseDragging = false;

function animate() {
  requestAnimationFrame(animate);

  const delta = clock.getDelta();
  world.step(1 / 60, delta, 3);  // added substeps

  handleMovement();

  playerMesh.position.copy(playerBody.position);
  playerMesh.quaternion.copy(playerBody.quaternion);

  debugBodies.forEach(({ mesh, body }) => {
    mesh.position.copy(body.position);
    mesh.quaternion.copy(body.quaternion);
  });

  
  if (!isMouseDragging) {
    followPos.copy(playerMesh.position).add(camOffset);
    camera.position.lerp(followPos, 0.1);
    camera.lookAt(playerMesh.position);
    // keep controls.target synced to player so when user starts dragging it orbits around player
    controls.target.copy(playerMesh.position);
  }

  // Always update controls for damping to work (no-op when disabled)
  controls.update();

  renderer.render(scene, camera);
}

animate();

// Resize handling
window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});
