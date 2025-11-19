import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'

import * as CANNON from 'cannon-es'

const scene = new THREE.Scene()
const camera: any = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000)

const renderer = new THREE.WebGLRenderer({ antialias: true })
renderer.setSize(window.innerWidth, window.innerHeight)
renderer.setClearColor(0x20232a)
document.body.appendChild(renderer.domElement as unknown as Node)

// OrbitControls for interactive inspect (damped)
const controls: any = new OrbitControls(camera, renderer.domElement as any)
controls.enableDamping = true
controls.dampingFactor = 0.07
controls.target.set(0, 0, 0)

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
const loader = new GLTFLoader()
console.log('Attempting to load /models/121Final.glb')
loader.load(
 	'/models/121Final.glb',
	(gltf: any) => {
		scene.remove(fallbackMesh)
		const model: any = gltf.scene

		// Scale model to fit a 2-unit box
		const box = new THREE.Box3().setFromObject(model)
		const size = new THREE.Vector3()
		box.getSize(size)
		const maxDim = Math.max(size.x, size.y, size.z)
		if (maxDim > 0) {
			const scale = 2 / maxDim
			model.scale.setScalar(scale)
		}

		// Recenter model
		box.setFromObject(model)
		const center = box.getCenter(new THREE.Vector3())
		model.position.sub(center)

		scene.add(model)

		// Try to focus the camera on an object named "player" inside the model.
		// If found, position the camera relative to that object; otherwise fall back
		// to framing the whole model.
		const player: any = model.getObjectByName('player') || model.getObjectByName('Player')
		if (player) {
			console.log('Found player object — focusing camera on it')
			const pBox = new THREE.Box3().setFromObject(player)
			const pCenter = pBox.getCenter(new THREE.Vector3())
			const pSize = pBox.getSize(new THREE.Vector3())
			const maxP = Math.max(pSize.x, pSize.y, pSize.z)
			const camDist = maxP > 0 ? maxP * 2 : 3
			// place camera slightly above and behind the player center
			camera.position.set(pCenter.x, pCenter.y + Math.max(1, maxP * 0.75), pCenter.z + camDist)
			// point camera and update controls target
			camera.lookAt(pCenter)
			if (controls) {
				controls.target.copy(pCenter)
				controls.update()
			}
		} else {
			console.log('No "player" object found — framing entire model')
			// Position camera so the whole model fits
			const distance = box.getSize(new THREE.Vector3()).length()
			camera.position.z = Math.max(3, distance * 1.5)
			const modelCenter = box.getCenter(new THREE.Vector3())
			camera.lookAt(modelCenter)
			if (controls) {
				controls.target.copy(modelCenter)
				controls.update()
			}
		}
	},
	undefined,
	(error: any) => {
		console.error('Error loading model:', error)
	}
)

function animate() {
	requestAnimationFrame(animate)
	fallbackMesh.rotation.x += 0.01
	fallbackMesh.rotation.y += 0.01
	// update controls for damping
	if (controls && typeof controls.update === 'function') controls.update()
	renderer.render(scene, camera)
}

animate()

window.addEventListener('resize', () => {
	camera.aspect = window.innerWidth / window.innerHeight
	camera.updateProjectionMatrix()
	renderer.setSize(window.innerWidth, window.innerHeight)
})

const world = new CANNON.World({
    gravity: new CANNON.Vec3(0, -9.82, 0)
})
world.broadphase = new CANNON.SAPBroadphase(world)
world.allowSleep = true
