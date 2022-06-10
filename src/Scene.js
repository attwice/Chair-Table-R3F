import { useRef, useState, useEffect, useMemo, Suspense } from 'react'
import { Canvas, useFrame, createPortal, useThree } from '@react-three/fiber'
import { PerspectiveCamera, ScreenQuad, useGLTF, useFBO, AdaptiveDpr } from '@react-three/drei'
import { CrossFadeMaterial } from './XFadeMaterial'
import { a, useSprings } from '@react-spring/three'
import * as THREE from 'three'

const transitions = {
  from: { rotation: [0, -Math.PI / 10, 0], scale: [0.8, 0.8, 0.8] },
  enter: { rotation: [0, 0, 0], scale: [1, 1, 1] },
  leave: { rotation: [0, Math.PI / 10, 0], scale: [0.8, 0.8, 0.8] }
}

const sceneStyle = { width: '100vw', height: '56vw' }

const enter = transitions.enter
const leave = transitions.leave

function Model({ model, ...props }) {
  const ref = useRef()
  const [rEuler, rQuaternion] = useMemo(() => [new THREE.Euler(), new THREE.Quaternion()], [])

  useFrame((state) => {
    if (ref.current) {
      rEuler.set(0, (state.mouse.x * Math.PI) / 150, (-state.mouse.y * Math.PI) / 150)
      ref.current.quaternion.slerp(rQuaternion.setFromEuler(rEuler), 0.1)
    }
  })

  return (
    <group ref={ref}>
      <spotLight intensity={0.7} position={[8, 6, -4]} penumbra={0} />
      <a.primitive {...props} object={model.scene} />
    </group>
  )
}

function RenderScene({ target, model, camRef, ...props }) {
  const scene = useMemo(() => new THREE.Scene(), [])

  useFrame((state) => {
    state.gl.setRenderTarget(target)
    state.gl.render(scene, camRef.current)
  }, 0)

  if (!model) return null

  return <>{createPortal(<Model model={model} {...props} />, scene)}</>
}

function Models({ shownIndex, models }) {
  const _models = useGLTF(models)
  // this holds the indexes of the 3D models shown for the scenes
  // [modelIdxForScene0, modelIdxForScene1]
  const [idxesInScenes] = useState([shownIndex, (shownIndex + 1) % models.length])

  // ref of the hidden texture target index
  // in other words the idx of the scene NOT shown
  const hiddenTxt = useRef(1)

  // shown texture index will hold the ref of the scene
  // we transition to, meaning shown on screen.
  const shownTxt = useMemo(() => {
    // if the none of the scenes feature the objectIndex we set the current hidden texture
    // (which will be the showing texture in the following render) to the objectIndex
    if (idxesInScenes.indexOf(shownIndex) < 0) idxesInScenes[hiddenTxt.current] = shownIndex

    // the shown texture is the scene holding the model index
    const idx = idxesInScenes.indexOf(shownIndex)
    // the hidden texture is obviously 0 when the shown scene is 1 and vice versa
    hiddenTxt.current = idx ? 0 : 1
    return idx
  }, [shownIndex, idxesInScenes])

  // when using drei
  const t0 = useFBO({ stencilBuffer: false, multisample: true })
  const t1 = useFBO({ stencilBuffer: false, multisample: true })

  const targets = [t0, t1]

  const camRef = useRef(null)

  useFrame((state) => {
    state.gl.setRenderTarget(null)
    state.gl.render(state.scene, state.camera)
  }, 1)

  const [springs, api] = useSprings(2, (i) => transitions[i === 0 ? 'enter' : 'from'])
  const regress = useThree((state) => state.performance.regress)

  useEffect(() => {
    api.start((i) => {
      const isEntering = i === shownTxt
      const t = isEntering ? enter : leave
      return { ...t, onChange: () => regress() }
    })
  }, [api, shownTxt, regress])

  return (
    <>
      <PerspectiveCamera
        ref={camRef}
        position={[-2.71, 1.34, 1.8]}
        rotation={[-0.74, -1.14, -0.7]}
        far={9}
        fov={37.1}
      />
      <ScreenQuad>
        <CrossFadeMaterial attach="material" texture1={t0.texture} texture2={t1.texture} shownTxt={shownTxt} />
      </ScreenQuad>
      {springs.map((props, i) => (
        <RenderScene key={i} target={targets[i]} model={_models[idxesInScenes[i]]} camRef={camRef} {...props} />
      ))}
    </>
  )
}

export function Scene({ models, shownIndex = 0, target }) {
  return (
    <Canvas
      dpr={[1, 1.5]}
      orthographic
      linear
      flat
      performance={{ min: 0.7 }}
      gl={{ antialias: false }}
      onCreated={({ events }) => events.connect(target.current)}
      style={sceneStyle}>
      <AdaptiveDpr />
      <Suspense fallback={null}>
        <Models shownIndex={shownIndex} models={models} />
      </Suspense>
    </Canvas>
  )
}
