"use client";

import { useEffect, useRef } from "react";

export default function RootBackground() {
  const orbsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (reduced.matches) return;

    const container = orbsRef.current;
    if (!container) return;
    const orbs = Array.from(container.querySelectorAll<HTMLElement>(".orb"));

    let mx = 0;
    let my = 0;
    let tmx = 0;
    let tmy = 0;
    let raf = 0;

    const onMouse = (e: MouseEvent) => {
      tmx = (e.clientX / window.innerWidth) * 2 - 1;
      tmy = (e.clientY / window.innerHeight) * 2 - 1;
    };

    const loop = () => {
      mx += (tmx - mx) * 0.05;
      my += (tmy - my) * 0.05;
      const scrollY = window.scrollY;
      for (const orb of orbs) {
        const d = parseFloat(orb.dataset.depth || "0");
        orb.style.transform = `translate3d(${mx * 40 * d}px, ${my * 40 * d - scrollY * d * 0.25}px, 0)`;
      }
      raf = window.requestAnimationFrame(loop);
    };

    window.addEventListener("mousemove", onMouse);
    raf = window.requestAnimationFrame(loop);

    return () => {
      window.removeEventListener("mousemove", onMouse);
      window.cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <>
      <div ref={orbsRef} className="orbs" aria-hidden>
        <span className="orb o1" data-depth="1" />
        <span className="orb o2" data-depth="0.7" />
        <span className="orb o3" data-depth="0.5" />
        <span className="orb o4" data-depth="0.85" />
      </div>
      <svg className="grain" aria-hidden xmlns="http://www.w3.org/2000/svg">
        <filter id="grain-noise">
          <feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="2" stitchTiles="stitch" />
        </filter>
        <rect width="100%" height="100%" filter="url(#grain-noise)" />
      </svg>
    </>
  );
}
