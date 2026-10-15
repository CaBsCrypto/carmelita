import {
  AmbientLight,
  BufferGeometry,
  DirectionalLight,
  Group,
  Material,
  Mesh,
  MeshStandardMaterial,
  OctahedronGeometry,
  OrthographicCamera,
  Scene,
  SphereGeometry,
  SRGBColorSpace,
  TorusGeometry,
  Vector3,
  WebGLRenderer,
} from "three";

export type LandingDepthScene = {
  resize(width: number, height: number, pixelRatio: number): void;
  pose(x: number, y: number): void;
  render(): void;
  dispose(): void;
};

/** Decorative, demand-rendered geometry; the accessible conversation stays in HTML. */
export function createLandingDepthScene(host: HTMLElement, onContextLost: () => void): LandingDepthScene {
  // DOM and WebGL are only touched when the client explicitly creates a scene.
  const canvas = host.ownerDocument.createElement("canvas");
  const scene = new Scene();
  const group = new Group();
  const camera = new OrthographicCamera(-3, 3, 2.85, -2.85, 0.1, 30);
  const geometries = new Set<BufferGeometry>();
  const materials = new Set<Material>();
  const movingNodes: { mesh: Mesh; origin: Vector3; direction: number }[] = [];
  let context: WebGL2RenderingContext | null = null;
  let renderer: WebGLRenderer | null = null;
  let disposed = false;
  let contextLost = false;
  let renderCount = 0;

  const handleContextLost = (event: Event) => {
    event.preventDefault();
    if (disposed || contextLost) return;
    contextLost = true;
    onContextLost();
  };

  const ownGeometry = <T extends BufferGeometry>(geometry: T): T => {
    geometries.add(geometry);
    return geometry;
  };
  const ownMaterial = <T extends Material>(material: T): T => {
    materials.add(material);
    return material;
  };
  const safelyRelease = (release: () => void) => {
    try { release(); } catch { /* Continue disposing the other owned resources. */ }
  };

  function dispose() {
    if (disposed) return;
    disposed = true;
    canvas.removeEventListener("webglcontextlost", handleContextLost);
    for (const geometry of geometries) safelyRelease(() => geometry.dispose());
    for (const material of materials) safelyRelease(() => material.dispose());
    geometries.clear();
    materials.clear();
    movingNodes.length = 0;
    group.clear();
    scene.clear();
    const ownedRenderer = renderer;
    renderer = null;
    if (ownedRenderer) safelyRelease(() => ownedRenderer.dispose());
    // This canvas is never reused. Context loss is only requested while removing it.
    canvas.remove();
    if (ownedRenderer) safelyRelease(() => ownedRenderer.forceContextLoss());
    else if (context) safelyRelease(() => context?.getExtension("WEBGL_lose_context")?.loseContext());
    context = null;
  }

  function resize(width: number, height: number, pixelRatio: number) {
    if (disposed || contextLost || !renderer) return;
    const safeWidth = Number.isFinite(width) ? Math.max(1, Math.round(width)) : 560;
    const safeHeight = Number.isFinite(height) ? Math.max(1, Math.round(height)) : 540;
    const safePixelRatio = Number.isFinite(pixelRatio) ? Math.min(1.5, Math.max(1, pixelRatio)) : 1;
    const aspect = safeWidth / safeHeight;
    // Preserve the whole decoration rather than stretching it on narrow hosts.
    const viewHeight = Math.max(5.7, 5.6 / aspect);
    camera.left = -viewHeight * aspect / 2;
    camera.right = viewHeight * aspect / 2;
    camera.top = viewHeight / 2;
    camera.bottom = -viewHeight / 2;
    camera.updateProjectionMatrix();
    renderer.setPixelRatio(safePixelRatio);
    renderer.setSize(safeWidth, safeHeight, false);
    canvas.dataset.pixelRatio = String(safePixelRatio);
  }

  function pose(x: number, y: number) {
    if (disposed || contextLost) return;
    const boundedX = Number.isFinite(x) ? Math.max(-1, Math.min(1, x)) : 0;
    const boundedY = Number.isFinite(y) ? Math.max(-1, Math.min(1, y)) : 0;
    // The wrapper supplies a smoothed pose; the total angular excursion stays below 0.08 rad.
    group.rotation.set(boundedY * 0.04, boundedX * 0.055, 0);
    for (const node of movingNodes) {
      node.mesh.position.set(
        node.origin.x + boundedX * 0.035 * node.direction,
        node.origin.y + boundedY * 0.025 * node.direction,
        node.origin.z,
      );
    }
  }

  function render() {
    if (disposed || contextLost || !renderer) return;
    renderer.render(scene, camera);
    renderCount += 1;
    canvas.dataset.renderCount = String(renderCount);
    canvas.dataset.drawCalls = String(renderer.info.render.calls);
    canvas.dataset.triangles = String(renderer.info.render.triangles);
  }

  try {
    canvas.setAttribute("aria-hidden", "true");
    canvas.tabIndex = -1;
    canvas.style.display = "block";
    canvas.style.width = "100%";
    canvas.style.height = "100%";
    canvas.style.pointerEvents = "none";
    canvas.dataset.renderCount = "0";
    canvas.dataset.drawCalls = "0";
    canvas.dataset.triangles = "0";
    canvas.addEventListener("webglcontextlost", handleContextLost);
    // Creating the context first also lets constructor failures release its GPU allocation.
    context = canvas.getContext("webgl2", {
      alpha: true, antialias: true, depth: true, stencil: false,
      premultipliedAlpha: true, preserveDrawingBuffer: false, powerPreference: "low-power",
    });
    if (!context) throw new Error("landing_depth_webgl_unavailable");
    renderer = new WebGLRenderer({ canvas, context, alpha: true, antialias: true });
    renderer.setClearColor(0x000000, 0);
    renderer.outputColorSpace = SRGBColorSpace;
    renderer.shadowMap.enabled = false;
    camera.position.set(0, 0, 12);
    camera.lookAt(0, 0, 0);
    scene.add(group, new AmbientLight(0xffffff, 1.8));
    const light = new DirectionalLight(0xfff6eb, 2.4);
    light.position.set(-3, 5, 7);
    scene.add(light);

    const forest = ownMaterial(new MeshStandardMaterial({ color: 0x153f32, metalness: 0.55, roughness: 0.34 }));
    const sage = ownMaterial(new MeshStandardMaterial({ color: 0x90ad9e, metalness: 0.45, roughness: 0.4 }));
    const coral = ownMaterial(new MeshStandardMaterial({ color: 0xff5b3a, metalness: 0.2, roughness: 0.4, flatShading: true }));
    const ringSpecs = [
      { radius: 2.65, tube: 0.045, arc: Math.PI * 2 - 0.64, position: [0.14, 0.05, 0] as const, rotation: [0.27, 0.15, -0.13] as const, material: forest },
      { radius: 2.48, tube: 0.032, arc: Math.PI * 2, position: [-0.06, 0.02, -0.22] as const, rotation: [0.78, -0.2, 0.24] as const, material: sage },
      { radius: 2.39, tube: 0.035, arc: Math.PI * 2, position: [0.22, -0.04, -0.12] as const, rotation: [-0.2, 0.72, 0.46] as const, material: forest },
    ];
    const rings = ringSpecs.map(spec => {
      const geometry = ownGeometry(new TorusGeometry(spec.radius, spec.tube, 8, 64, spec.arc));
      // Center the outer arc's opening on the right, recalling the brand's open C.
      geometry.rotateZ((Math.PI * 2 - spec.arc) / 2);
      const ring = new Mesh(geometry, spec.material);
      ring.position.set(spec.position[0], spec.position[1], spec.position[2]);
      ring.rotation.set(spec.rotation[0], spec.rotation[1], spec.rotation[2]);
      group.add(ring);
      return ring;
    });

    const facetGeometry = ownGeometry(new OctahedronGeometry(1, 0));
    const sphereGeometry = ownGeometry(new SphereGeometry(1, 12, 8));
    const nodeSpecs = [
      { ring: 0, angle: 0.32, size: 0.17, facet: true, material: coral },
      { ring: 0, angle: 2.52, size: 0.085, facet: false, material: sage },
      { ring: 0, angle: Math.PI + 0.13, size: 0.17, facet: true, material: coral },
      { ring: 1, angle: -0.14, size: 0.13, facet: true, material: coral },
      { ring: 1, angle: 3.11, size: 0.075, facet: false, material: forest },
      { ring: 2, angle: 1.82, size: 0.09, facet: true, material: coral },
    ];
    nodeSpecs.forEach((spec, index) => {
      const ring = rings[spec.ring];
      const radius = ringSpecs[spec.ring].radius;
      const origin = new Vector3(radius * Math.cos(spec.angle), radius * Math.sin(spec.angle), 0)
        .applyEuler(ring.rotation).add(ring.position);
      const node = new Mesh(spec.facet ? facetGeometry : sphereGeometry, spec.material);
      node.scale.setScalar(spec.size);
      node.position.copy(origin);
      node.rotation.set(index * 0.28, index * 0.4, 0.35);
      group.add(node);
      if (spec.facet) movingNodes.push({ mesh: node, origin, direction: index % 2 ? -1 : 1 });
    });

    if (contextLost) throw new Error("landing_depth_context_lost");
    host.appendChild(canvas);
    resize(host.clientWidth || 560, host.clientHeight || 540, 1);
    return { resize, pose, render, dispose };
  } catch (error) {
    dispose();
    throw error;
  }
}
