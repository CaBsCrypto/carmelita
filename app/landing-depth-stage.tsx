"use client";

import { useEffect, useRef, type ReactNode } from "react";
import type { LandingDepthScene } from "./landing-depth-scene";
import styles from "./home-experience.module.css";

export default function LandingDepthStage({ children, reduced }: { children: ReactNode; reduced: boolean }) {
  const stageRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const stageElement = stageRef.current;
    const sceneHost = sceneRef.current;
    if (!stageElement || !sceneHost) return;
    const stage = stageElement;
    const host = sceneHost;

    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const desktop = window.matchMedia("(min-width: 900px) and (hover: hover) and (pointer: fine)");
    let scene: LandingDepthScene | null = null;
    let disposed = false;
    let visible = false;
    let loading = false;
    let generation = 0;
    let frameId = 0;
    let previousTime = 0;
    let currentX = 0;
    let currentY = 0;
    let targetX = 0;
    let targetY = 0;

    const interactive = () => !reduced && !motion.matches && desktop.matches;
    const setSceneState = (state: string) => { stage.dataset.scene = state; };
    const syncVisibility = () => {
      const bounds = stage.getBoundingClientRect();
      visible = bounds.width > 0 && bounds.height > 0 && bounds.bottom > 0 && bounds.top < window.innerHeight
        && bounds.right > 0 && bounds.left < window.innerWidth;
      stage.dataset.inView = String(visible);
    };
    const cancelFrame = () => {
      if (frameId) cancelAnimationFrame(frameId);
      frameId = 0;
      previousTime = 0;
    };
    const resetPose = () => {
      currentX = currentY = targetX = targetY = 0;
      stage.style.setProperty("--depth-x", "0deg");
      stage.style.setProperty("--depth-y", "0deg");
      scene?.pose(0, 0);
    };
    const releaseScene = () => {
      generation += 1;
      loading = false;
      scene?.dispose();
      scene = null;
    };
    const renderSize = () => {
      if (!scene || !visible || document.hidden) return;
      scene.resize(host.clientWidth, host.clientHeight, Math.min(window.devicePixelRatio || 1, 1.5));
      scene.render();
    };

    function scheduleFrame() {
      if (!frameId && !disposed && visible && interactive() && !document.hidden) {
        frameId = requestAnimationFrame(renderPose);
      }
    }
    function renderPose(time: number) {
      frameId = 0;
      if (disposed || !visible || !interactive() || document.hidden) return;
      const elapsed = previousTime ? Math.min(time - previousTime, 50) : 16;
      previousTime = time;
      const easing = 1 - Math.exp(-elapsed / 65);
      currentX += (targetX - currentX) * easing;
      currentY += (targetY - currentY) * easing;
      stage.style.setProperty("--depth-x", `${(-currentY * 2.2).toFixed(3)}deg`);
      stage.style.setProperty("--depth-y", `${(currentX * 2.8).toFixed(3)}deg`);
      scene?.pose(currentX, currentY);
      scene?.render();
      if (Math.abs(targetX - currentX) + Math.abs(targetY - currentY) > 0.001) {
        scheduleFrame();
      } else {
        previousTime = 0;
      }
    }
    const contextLost = () => {
      if (disposed) return;
      cancelFrame();
      releaseScene();
      resetPose();
      stage.dataset.motion = "static";
      setSceneState("fallback");
    };
    const loadScene = () => {
      syncVisibility();
      if (disposed || loading || scene || !visible || !interactive() || document.hidden) return;
      loading = true;
      const epoch = ++generation;
      setSceneState("loading");
      void import("./landing-depth-scene").then(({ createLandingDepthScene }) => {
        if (disposed || epoch !== generation) return;
        loading = false;
        syncVisibility();
        if (!visible || !interactive() || document.hidden) {
          setSceneState("static");
          return;
        }
        try {
          scene = createLandingDepthScene(host, contextLost);
          scene.pose(currentX, currentY);
          renderSize();
          if (scene && epoch === generation) setSceneState("ready");
        } catch {
          releaseScene();
          stage.dataset.motion = "static";
          setSceneState("fallback");
        }
      }).catch(() => {
        if (disposed || epoch !== generation) return;
        loading = false;
        stage.dataset.motion = "static";
        setSceneState("fallback");
      });
    };
    const configure = () => {
      cancelFrame();
      resetPose();
      if (!interactive()) {
        releaseScene();
        stage.dataset.motion = "static";
        setSceneState("static");
      } else {
        stage.dataset.motion = "interactive";
        loadScene();
        renderSize();
      }
    };
    const pointerMove = (event: PointerEvent) => {
      if (!interactive() || !visible || event.pointerType === "touch" || stage.dataset.scene === "fallback") return;
      const bounds = stage.getBoundingClientRect();
      if (!bounds.width || !bounds.height) return;
      targetX = Math.max(-1, Math.min(1, ((event.clientX - bounds.left) / bounds.width) * 2 - 1));
      targetY = Math.max(-1, Math.min(1, ((event.clientY - bounds.top) / bounds.height) * 2 - 1));
      scheduleFrame();
    };
    const pointerLeave = () => { targetX = targetY = 0; scheduleFrame(); };
    const visibilityChange = () => {
      cancelFrame();
      resetPose();
      if (!document.hidden) { loadScene(); renderSize(); }
    };
    if (typeof IntersectionObserver === "undefined" || typeof ResizeObserver === "undefined") {
      stage.dataset.motion = "static";
      setSceneState("fallback");
      return;
    }
    const intersection = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      if (visible) { loadScene(); renderSize(); }
      else { cancelFrame(); resetPose(); }
    }, { threshold: 0.05 });
    const resize = new ResizeObserver(() => { loadScene(); renderSize(); });

    stage.addEventListener("pointermove", pointerMove);
    stage.addEventListener("pointerleave", pointerLeave);
    stage.addEventListener("pointercancel", pointerLeave);
    document.addEventListener("visibilitychange", visibilityChange);
    motion.addEventListener("change", configure);
    desktop.addEventListener("change", configure);
    intersection.observe(stage);
    resize.observe(host);
    configure();

    return () => {
      disposed = true;
      cancelFrame();
      intersection.disconnect();
      resize.disconnect();
      stage.removeEventListener("pointermove", pointerMove);
      stage.removeEventListener("pointerleave", pointerLeave);
      stage.removeEventListener("pointercancel", pointerLeave);
      document.removeEventListener("visibilitychange", visibilityChange);
      motion.removeEventListener("change", configure);
      desktop.removeEventListener("change", configure);
      releaseScene();
      resetPose();
      stage.dataset.motion = "static";
      setSceneState("static");
    };
  }, [reduced]);

  return (
    <div ref={stageRef} className={styles.depthStage} data-scene="pending" data-motion="static" data-simple={reduced}>
      <div className={styles.depthBackdrop} aria-hidden="true">
        <div className={styles.depthFallback} />
        <div ref={sceneRef} className={styles.depthScene} />
      </div>
      <div className={styles.depthCard}>{children}</div>
    </div>
  );
}
