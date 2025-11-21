import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import * as CANNON from "cannon-es";

// Basic Scene Setup
const scene = new THREE.Scene();
scene.background = new THREE.Color(0xa8d0ff); // Light blue background

const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.set(5, 5, 10);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

// OrbitControls (disabled during gameplay)
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.enabled = false;  // 🔥 IMPORTANT so camera follow works

// Lights
const ambientLight = new THREE.AmbientLight(0xffffff, 0.9);
scene.add(ambientLight);

const sunLight = new THREE.DirectionalLight(0xffffff, 1);
sunLight.position.set(10, 20, 10);
scene.add(sunLight);

// Physics World
const world = new CANNON.World({
    gravity: new CANNON.Vec3(0, -9.82, 0)
});

world.broadphase = new CANNON.SAPBroadphase(world);
world.allowSleep = true;

// Load Blender Map
const loader = new GLTFLoader();
let startPoint;

loader.load("/models/121Final.glb", (gltf) => {
    const map = gltf.scene;
    scene.add(map);

    // Shadows
    map.traverse((child) => {
        if (child.isMesh) {
            child.castShadow = child.receiveShadow = true;
            
            // Create physics body for each mesh
            if (child.geometry) {
                createPhysicsBody(child);
            }
        }
    });


    // Find "start"
    startPoint = map.getObjectByName("start");
    if (!startPoint) console.warn("❌ No object named 'start' found in Blender!");

    // Spawn player at start
    if (startPoint) {
        const startWorldPos = new THREE.Vector3();
        startPoint.getWorldPosition(startWorldPos);

        playerBody.position.set(
            startWorldPos.x,
            startWorldPos.y + 10,
            startWorldPos.z
        );
        playerMesh.position.copy(playerBody.position);
    }

}, undefined, (err) => {
    console.error("Error loading GLB:", err);
});

function createPhysicsBody(mesh) {
    mesh.geometry.computeBoundingBox();
    const box = mesh.geometry.boundingBox;
    const size = new THREE.Vector3();
    box.getSize(size);
    
    // Get world transformation
    mesh.updateWorldMatrix(true, true);
    const position = new THREE.Vector3();
    const quaternion = new THREE.Quaternion();
    const scale = new THREE.Vector3();
    mesh.matrixWorld.decompose(position, quaternion, scale);
    
    const shape = new CANNON.Box(new CANNON.Vec3(
        (size.x * scale.x) / 2, 
        (size.y * scale.y) / 2, 
        (size.z * scale.z) / 2
    ));
    
    const body = new CANNON.Body({
        mass: 0,
        shape: shape,
    });
    
    body.position.copy(position);
    body.quaternion.copy(quaternion);
    
    world.addBody(body);
}

// Player Sphere
const radius = 1;

// Physics body
const playerShape = new CANNON.Sphere(radius);
const playerBody = new CANNON.Body({
    mass: 1,
    shape: playerShape,
    position: new CANNON.Vec3(0, 99999, 0)
});
world.addBody(playerBody);

// 3D sphere
const playerGeometry = new THREE.SphereGeometry(radius, 32, 32);
const playerMaterial = new THREE.MeshStandardMaterial({ color: 0xff5555 });
const playerMesh = new THREE.Mesh(playerGeometry, playerMaterial);
scene.add(playerMesh);

// Movement (WASD)
const keys = {};
window.addEventListener("keydown", (e) => (keys[e.key] = true));
window.addEventListener("keyup", (e) => (keys[e.key] = false));

function handleMovement() {
    const force = 20;

    if (keys["w"]) playerBody.applyForce(new CANNON.Vec3(0, 0, -force), playerBody.position);
    if (keys["s"]) playerBody.applyForce(new CANNON.Vec3(0, 0, force), playerBody.position);
    if (keys["a"]) playerBody.applyForce(new CANNON.Vec3(-force, 0, 0), playerBody.position);
    if (keys["d"]) playerBody.applyForce(new CANNON.Vec3(force, 0, 0), playerBody.position);
}

// Animation Loop
const clock = new THREE.Clock();
const camOffset = new THREE.Vector3(0, 5, 10); // Camera offset behind player
const followPos = new THREE.Vector3();

function animate() {
    requestAnimationFrame(animate);

    const delta = clock.getDelta();
    world.step(1 / 60, delta);

    // Movement
    handleMovement();

    // Sync visuals to physics
    playerMesh.position.copy(playerBody.position);
    playerMesh.quaternion.copy(playerBody.quaternion);

    // CAMERA FOLLOW SYSTEM (smooth)
    followPos.copy(playerMesh.position).add(camOffset);
    camera.position.lerp(followPos, 0.1);
    camera.lookAt(playerMesh.position);

    renderer.render(scene, camera);
}

animate();

// Resize
window.addEventListener("resize", () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});
