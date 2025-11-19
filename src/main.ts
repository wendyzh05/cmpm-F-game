import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'

import * as CANNON from 'cannon-es'

const scene = new THREE.Scene()
const camera: any = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000)

let playerMesh: THREE.Mesh | null = null;
let playerBody: CANNON.Body | null = null;

const renderer = new THREE.WebGLRenderer({ antialias: true })
renderer.setSize(window.innerWidth, window.innerHeight)
renderer.setClearColor(0x20232a)
document.body.appendChild(renderer.domElement as unknown as Node)

// OrbitControls for interactive inspect (damped)
const controls: any = new OrbitControls(camera, renderer.domElement as any)
controls.enableDamping = true
controls.dampingFactor = 0.07
controls.target.set(0, 0, 0)

const loader = new GLTFLoader()
// Debug info to help diagnose a black screen
console.log('three renderer:', renderer)
try {
	const gl = (renderer.getContext && (renderer.getContext() as any)) || null
 	console.log('WebGL context:', gl)
} catch (e) {
 	console.warn('Could not get WebGL context', e)
}

// Fallback cube while the model loads (use a basic color so it's visible)
const fallbackGeometry = new THREE.BoxGeometry()
const fallbackMaterial = new THREE.MeshBasicMaterial({ color: 0xff0066 })
const fallbackMesh: any = new THREE.Mesh(fallbackGeometry, fallbackMaterial)
scene.add(fallbackMesh)

// Add simple lighting and helpers to ensure scene visibility
const ambient: any = new THREE.AmbientLight(0xffffff, 2)
scene.add(ambient)
const dirLight: any = new THREE.DirectionalLight(0xffffff, 1.2)
dirLight.position.set(5, 10, 5)
scene.add(dirLight)

const fill = new THREE.DirectionalLight(0xffffff, 1);
fill.position.set(-5, 5, -5);
scene.add(fill);

renderer.setClearColor(0x87ceeb)

camera.position.z = 3
camera.lookAt(0, 0, 0)

// GLTF/GLB loader. Place your exported file at `public/models/model.glb`.
loader.load(
  '/models/121Final.glb',
  (gltf: any) => {
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

    // Re-center model
    box.setFromObject(model)
    const center = box.getCenter(new THREE.Vector3())
    model.position.sub(center)

    //Find Player Object
    const player =
      model.getObjectByName('player') || model.getObjectByName('Player')

    if (player) {
      console.log("Player object found!")
      playerMesh = player

      // Compute size and center
      const pBox = new THREE.Box3().setFromObject(player)
      const pSize = new THREE.Vector3()
      pBox.getSize(pSize)
      const radius = Math.max(pSize.x, pSize.y, pSize.z) / 2
      const pCenter = pBox.getCenter(new THREE.Vector3())

      const sphereShape = new CANNON.Sphere(radius)
      playerBody = new CANNON.Body({
        mass: 1,
        shape: sphereShape,
        position: new CANNON.Vec3(pCenter.x, pCenter.y, pCenter.z),
      })
      world.addBody(playerBody)

      // Camera focus
      const camDist = radius * 4
      camera.position.set(pCenter.x, pCenter.y + radius * 2, pCenter.z + camDist)
      camera.lookAt(pCenter)
      controls.target.copy(pCenter)
      controls.update()
    } else {
      console.warn("Player object NOT found; using whole model for camera focus")

      const center = box.getCenter(new THREE.Vector3())
      camera.position.set(center.x, center.y + 2, center.z + 5)
      camera.lookAt(center)
      controls.target.copy(center)
    }
  },
  undefined,
  (err: any) => console.error('GLB load error:', err)
)

function animate() {
	requestAnimationFrame(animate)
	world.step(1/60);
	fallbackMesh.rotation.x += 0.01
	fallbackMesh.rotation.y += 0.01
	// update controls for damping
	if (controls && typeof controls.update === 'function') controls.update()
	renderer.render(scene, camera)
	if (playerMesh && playerBody) {
		playerMesh.position.copy(playerBody.position as any);
		playerMesh.quaternion.copy(playerBody.quaternion as any);
	}
}

animate()

window.addEventListener('resize', () => {
	camera.aspect = window.innerWidth / window.innerHeight
	camera.updateProjectionMatrix()
	renderer.setSize(window.innerWidth, window.innerHeight)
})

const force = 5;

window.addEventListener('keydown', (e) => {
    if (!playerBody) return;

    if (e.key === 'w') playerBody.applyForce(new CANNON.Vec3(0, 0, -force), playerBody.position);
    if (e.key === 's') playerBody.applyForce(new CANNON.Vec3(0, 0, force), playerBody.position);
    if (e.key === 'a') playerBody.applyForce(new CANNON.Vec3(-force, 0, 0), playerBody.position);
    if (e.key === 'd') playerBody.applyForce(new CANNON.Vec3(force, 0, 0), playerBody.position);
});

const world = new CANNON.World({
    gravity: new CANNON.Vec3(0, -9.82, 0)
})
world.broadphase = new CANNON.SAPBroadphase(world)
world.allowSleep = true
