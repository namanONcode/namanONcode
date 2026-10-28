'use client';

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { createSkylineDraw } from './skylineAnimation.js';

/**
 * React Client Component for GitHub Skyline Contribution Graph animation.
 * 
 * - One canvas that fills its container at devicePixelRatio (max 2).
 * - Pure function draw(ctx, w, h, t) where t is milliseconds since start.
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
  const [isHovered, setIsHovered] = useState(false);

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
    drawFuncRef.current(ctx, width, height, t);
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

  return (
    <div
      ref={containerRef}
      className={`relative w-full overflow-hidden rounded-xl border border-white/10 bg-[#121212]/90 backdrop-blur-md shadow-2xl ${className}`}
      style={{ minHeight: '260px' }}
    >
      <canvas
        ref={canvasRef}
        role="img"
        aria-label={`GitHub Skyline contribution graph for ${data?.username || 'user'}`}
        className="block w-full h-full"
      />

      {/* Small Replay Button */}
      <button
        type="button"
        onClick={replay}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        aria-label="Replay animation"
        className="absolute top-3 right-3 z-10 flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-mono font-medium transition-all duration-200 cursor-pointer"
        style={{
          backgroundColor: isHovered ? 'rgba(64, 196, 99, 0.2)' : 'rgba(255, 255, 255, 0.06)',
          borderColor: isHovered ? 'rgba(64, 196, 99, 0.5)' : 'rgba(255, 255, 255, 0.12)',
          color: isHovered ? '#ffffff' : '#e0e0e0',
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
