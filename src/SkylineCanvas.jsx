'use client';

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { createSkylineDraw } from './skylineAnimation.js';

/**
 * React Client Component for GitHub Skyline Contribution Graph animation.
 * Light Mode Theme with Hover Interactivity.
 * 
 * - One canvas that fills its container at devicePixelRatio (max 2).
 * - Pure function draw(ctx, w, h, t, hoveredDay) where t is milliseconds since start.
 * - Interactive mouse hover with dynamic tooltips.
 * - Replay button resets t.
 * - prefers-reduced-motion draws t = Infinity.
 * - Starts playing when 40% in view (IntersectionObserver).
 * - Only runs requestAnimationFrame while visible.
 * 
 * @param {Object} props
 * @param {Object} props.data - Imported data/github.json object
 * @param {string} [props.className] - Optional extra CSS classes
 */
export default function SkylineCanvas({ data, className = '' }) {
  const containerRef = useRef(null);
  const canvasRef = useRef(null);
  const rafRef = useRef(null);
  const startTimeRef = useRef(null);
  const isVisibleRef = useRef(false);
  const hasStartedRef = useRef(false);
  const prefersReducedMotionRef = useRef(false);
  const drawFuncRef = useRef(null);
  const hoveredDayRef = useRef(null);
  const [isBtnHovered, setIsBtnHovered] = useState(false);

  // Initialize pure draw function
  useEffect(() => {
    if (data) {
      drawFuncRef.current = createSkylineDraw(data);
    }
  }, [data]);

  const renderFrame = useCallback((t) => {
    const canvas = canvasRef.current;
    if (!canvas || !drawFuncRef.current) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = parseFloat(canvas.style.width) || canvas.width;
    const height = parseFloat(canvas.style.height) || canvas.height;
    drawFuncRef.current(ctx, width, height, t, hoveredDayRef.current);
  }, []);

  const stopAnimation = useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
  }, []);

  const startAnimation = useCallback(() => {
    stopAnimation();
    if (!isVisibleRef.current) return;

    const loop = (now) => {
      if (!isVisibleRef.current) return;

      const elapsed = now - (startTimeRef.current || now);
      renderFrame(elapsed);

      if (elapsed < 4500) {
        rafRef.current = requestAnimationFrame(loop);
      } else {
        rafRef.current = null;
        renderFrame(Infinity);
      }
    };

    rafRef.current = requestAnimationFrame(loop);
  }, [renderFrame, stopAnimation]);

  const replay = useCallback(() => {
    if (prefersReducedMotionRef.current) {
      renderFrame(Infinity);
      return;
    }
    hasStartedRef.current = true;
    startTimeRef.current = performance.now();
    startAnimation();
  }, [renderFrame, startAnimation]);

  // Handle Resize and DPR (max 2)
  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;

    const updateSize = () => {
      const rect = container.getBoundingClientRect();
      const width = Math.floor(rect.width);
      const height = Math.floor(rect.height || (width > 600 ? 320 : 230));

      if (width === 0 || height === 0) return;

      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;

      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.scale(dpr, dpr);
      }

      if (prefersReducedMotionRef.current) {
        renderFrame(Infinity);
      } else if (hasStartedRef.current && startTimeRef.current !== null) {
        renderFrame(performance.now() - startTimeRef.current);
      } else {
        renderFrame(0);
      }
    };

    const resizeObserver = new ResizeObserver(updateSize);
    resizeObserver.observe(container);
    updateSize();

    return () => {
      resizeObserver.disconnect();
    };
  }, [renderFrame]);

  // Handle prefers-reduced-motion and IntersectionObserver (40% threshold)
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    prefersReducedMotionRef.current = mediaQuery.matches;

    const onMotionChange = (e) => {
      prefersReducedMotionRef.current = e.matches;
      if (e.matches) {
        stopAnimation();
        renderFrame(Infinity);
      } else {
        replay();
      }
    };
    mediaQuery.addEventListener('change', onMotionChange);

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const is40Percent = entry.isIntersecting && entry.intersectionRatio >= 0.4;
          if (is40Percent) {
            isVisibleRef.current = true;
            if (prefersReducedMotionRef.current) {
              renderFrame(Infinity);
              return;
            }
            if (!hasStartedRef.current) {
              hasStartedRef.current = true;
              startTimeRef.current = performance.now();
            }
            startAnimation();
          } else {
            isVisibleRef.current = false;
            stopAnimation();
          }
        }
      },
      { threshold: [0, 0.4, 1.0] }
    );

    observer.observe(container);

    return () => {
      stopAnimation();
      observer.disconnect();
      mediaQuery.removeEventListener('change', onMotionChange);
    };
  }, [renderFrame, replay, startAnimation, stopAnimation]);

  // Mouse hover handlers
  const handleMouseMove = (e) => {
    const canvas = canvasRef.current;
    if (!canvas || !data?.days) return;
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;

    const width = parseFloat(canvas.style.width) || canvas.width;
    const height = parseFloat(canvas.style.height) || canvas.height;
    const weeks = data.weeksCount || 53;
    const marginX = Math.max(16, width * 0.038);
    const usableW = width - marginX * 2;
    const stepX = usableW / (weeks + 1.2);
    const boxW = Math.max(2.4, stepX * 0.68);
    const slantX = Math.max(1.4, stepX * 0.28);
    const slantY = Math.max(1.8, slantX * 1.15);

    const rows = 7;
    const maxTowerH = Math.min(height * 0.42, 85);
    const heightScale = maxTowerH / Math.sqrt(Math.max(...(data.counts || [1])));
    const baseTileH = Math.max(1.6, Math.min(3, height * 0.012));
    const stepY = Math.max(4.8, (height * 0.36) / (rows - 0.5));
    const originY = Math.max(maxTowerH + 54, height * 0.46);

    let found = null;
    for (let r = rows - 1; r >= 0; r--) {
      for (let c = weeks - 1; c >= 0; c--) {
        const cell = data.days.find((d) => d.weekIndex === c && d.dayIndex === r);
        if (!cell) continue;

        const count = cell.count;
        const targetH = count === 0 ? baseTileH : baseTileH + Math.sqrt(count) * heightScale;
        const x = marginX + c * stepX;
        const y = originY + r * stepY;

        if (mx >= x && mx <= x + boxW + slantX && my >= y - targetH - slantY && my <= y) {
          found = cell;
          break;
        }
      }
      if (found) break;
    }

    if (found !== hoveredDayRef.current) {
      hoveredDayRef.current = found;
      canvas.style.cursor = found ? 'pointer' : 'default';
      const elapsed = startTimeRef.current ? performance.now() - startTimeRef.current : Infinity;
      renderFrame(elapsed);
    }
  };

  const handleMouseLeave = () => {
    if (hoveredDayRef.current !== null) {
      hoveredDayRef.current = null;
      if (canvasRef.current) canvasRef.current.style.cursor = 'default';
      const elapsed = startTimeRef.current ? performance.now() - startTimeRef.current : Infinity;
      renderFrame(elapsed);
    }
  };

  return (
    <div
      ref={containerRef}
      className={`relative w-full overflow-hidden rounded-xl border border-[#d0d7de] bg-white shadow-md ${className}`}
      style={{ minHeight: '260px' }}
    >
      <canvas
        ref={canvasRef}
        role="img"
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        aria-label={`GitHub Skyline contribution graph for ${data?.username || 'user'}`}
        className="block w-full h-full"
      />

      {/* Small Replay Button in Light Mode */}
      <button
        type="button"
        onClick={replay}
        onMouseEnter={() => setIsBtnHovered(true)}
        onMouseLeave={() => setIsBtnHovered(false)}
        aria-label="Replay animation"
        className="absolute top-3 right-3 z-10 flex items-center gap-1.5 px-3 py-1.5 rounded-md border text-xs font-mono font-semibold transition-all duration-150 cursor-pointer"
        style={{
          backgroundColor: isBtnHovered ? '#f3f4f6' : 'rgba(255, 255, 255, 0.9)',
          borderColor: isBtnHovered ? '#1a7f37' : '#d0d7de',
          color: isBtnHovered ? '#1a7f37' : '#24292f',
          boxShadow: '0 1px 3px rgba(31, 35, 40, 0.08)',
          backdropFilter: 'blur(8px)',
          WebkitBackdropFilter: 'blur(8px)',
        }}
      >
        <svg
          width="13"
          height="13"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
          <path d="M3 3v5h5" />
        </svg>
        <span>Replay</span>
      </button>
    </div>
  );
}
