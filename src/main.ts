import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import * as CANNON from 'cannon-es'

const scene = new THREE.Scene()
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000)

let playerMesh: THREE.Mesh | null = null;
let playerBody: CANNON.Body | null = null;

const renderer = new THREE.WebGLRenderer({ antialias: true })
renderer.setSize(window.innerWidth, window.innerHeight)
renderer.setClearColor(0x20232a)
document.body.appendChild(renderer.domElement)

// OrbitControls for interactive inspect (damped)
const controls = new OrbitControls(camera, renderer.domElement)
controls.enableDamping = true
controls.dampingFactor = 0.07
controls.target.set(0, 0, 0)

// Initialize physics world FIRST
const world = new CANNON.World({
    gravity: new CANNON.Vec3(0, -9.82, 0)
})
world.broadphase = new CANNON.SAPBroadphase(world)
world.allowSleep = true

// Add ground physics body
const groundBody = new CANNON.Body({
    type: CANNON.Body.STATIC,
    shape: new CANNON.Plane(),
})
groundBody.quaternion.setFromEuler(-Math.PI / 2, 0, 0) // Make it face up
world.addBody(groundBody)

const loader = new GLTFLoader()

// Debug info to help diagnose a black screen
console.log('three renderer:', renderer)
try {
    const gl = renderer.getContext() || null
    console.log('WebGL context:', gl)
} catch (e) {
    console.warn('Could not get WebGL context', e)
}

// Fallback cube while the model loads
const fallbackGeometry = new THREE.BoxGeometry()
const fallbackMaterial = new THREE.MeshBasicMaterial({ color: 0xff0066 })
const fallbackMesh = new THREE.Mesh(fallbackGeometry, fallbackMaterial)
scene.add(fallbackMesh)

// Add simple lighting and helpers to ensure scene visibility
const ambient = new THREE.AmbientLight(0xffffff, 2)
scene.add(ambient)
const dirLight = new THREE.DirectionalLight(0xffffff, 1.2)
dirLight.position.set(5, 10, 5)
scene.add(dirLight)

const fill = new THREE.DirectionalLight(0xffffff, 1)
fill.position.set(-5, 5, -5)
scene.add(fill)

renderer.setClearColor(0x87ceeb)

camera.position.z = 3
camera.lookAt(0, 0, 0)

// GLTF/GLB loader
loader.load(
    '/models/121Final.glb',
    (gltf) => {
        scene.remove(fallbackMesh)

        const model = gltf.scene
        scene.add(model)

        // Normalize model size
        const box = new THREE.Box3().setFromObject(model)
        const size = new THREE.Vector3()
        box.getSize(size)
        const maxDim = Math.max(size.x, size.y, size.z)
        const scale = 2 / maxDim
        model.scale.setScalar(scale)

        box.setFromObject(model)
        const center = box.getCenter(new THREE.Vector3())
        model.position.sub(center)

        // Find Player Object
        let player = model.getObjectByName('player') || model.getObjectByName('Player')

        if (!player) {
          console.warn("Player object NOT found!");
        } else {
          console.log("Player object found:", player);
        
          // If it's NOT a Mesh, search inside it for a mesh
          if (!(player instanceof THREE.Mesh)) {
              console.log("Player is not a Mesh. Searching children...");
              player = player.getObjectByProperty("type", "Mesh") as THREE.Mesh;
          }

          if (!player) {
              console.error("No Mesh found inside player object!");
          } else {
              playerMesh = player as THREE.Mesh;

              // Now Box3 will work with NO error
              const pBox = new THREE.Box3().setFromObject(playerMesh);
              const pSize = new THREE.Vector3();
              pBox.getSize(pSize);

              const radius = Math.max(pSize.x, pSize.y, pSize.z) / 2;

              const sphereShape = new CANNON.Sphere(radius);
              playerBody = new CANNON.Body({
                  mass: 1,
                  shape: sphereShape,
              });

              // Start above ground
              const pCenter = pBox.getCenter(new THREE.Vector3());
              playerBody.position.set(pCenter.x, pCenter.y + 2, pCenter.z);

              world.addBody(playerBody);
          }
      }

    }
);
    
function animate() {
    requestAnimationFrame(animate)
    
    // Step the physics world
    world.step(1/60)
    
    // Update fallback mesh rotation
    fallbackMesh.rotation.x += 0.01
    fallbackMesh.rotation.y += 0.01
    
    // Update controls for damping
    controls.update()
    
    // Sync physics with graphics
    if (playerMesh && playerBody) {
        playerMesh.position.copy(playerBody.position as any)
        playerMesh.quaternion.copy(playerBody.quaternion as any)
    }
    
    renderer.render(scene, camera)
}

animate()

window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight
    camera.updateProjectionMatrix()
    renderer.setSize(window.innerWidth, window.innerHeight)
})

const force = 5

window.addEventListener('keydown', (e) => {
    if (!playerBody) {
        console.warn('Player body not ready yet')
        return
    }

    // Reset velocity for more responsive controls
    playerBody.velocity.set(0, playerBody.velocity.y, 0)
    playerBody.angularVelocity.set(0, 0, 0)

    if (e.key === 'w') playerBody.applyForce(new CANNON.Vec3(0, 0, -force), playerBody.position)
    if (e.key === 's') playerBody.applyForce(new CANNON.Vec3(0, 0, force), playerBody.position)
    if (e.key === 'a') playerBody.applyForce(new CANNON.Vec3(-force, 0, 0), playerBody.position)
    if (e.key === 'd') playerBody.applyForce(new CANNON.Vec3(force, 0, 0), playerBody.position)
})