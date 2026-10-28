/**
 * Client component for GitHub Skyline Contribution Graph animation.
 * 
 * Requirements satisfied:
 * - One canvas that fills its box at devicePixelRatio (max 2).
 * - Pure function draw(ctx, w, h, t) where t is milliseconds since start.
 * - Replay button resets t.
 * - prefers-reduced-motion draws t = Infinity.
 * - Starts playing when 40% in view (IntersectionObserver).
 * - Only runs requestAnimationFrame while visible.
 */

import { createSkylineDraw } from './skylineAnimation.js';

export class SkylineComponent {
  /**
   * @param {HTMLElement} container Parent DOM element to host the component
   * @param {Object} githubData Data imported from data/github.json
   */
  constructor(container, githubData) {
    this.container = container;
    this.githubData = githubData;
    this.draw = createSkylineDraw(githubData);

    this.canvas = null;
    this.ctx = null;
    this.replayBtn = null;
    this.rafId = null;

    this.startTime = null;
    this.hasStarted = false;
    this.isVisible = false;
    this.prefersReducedMotion = false;

    this.width = 0;
    this.height = 0;

    this.init();
  }

  init() {
    this.container.style.position = 'relative';
    this.container.style.width = '100%';
    this.container.style.display = 'block';

    // Canvas element
    this.canvas = document.createElement('canvas');
    this.canvas.style.display = 'block';
    this.canvas.style.width = '100%';
    this.canvas.style.height = '100%';
    this.canvas.setAttribute('role', 'img');
    this.canvas.setAttribute(
      'aria-label',
      `GitHub Skyline 3D contribution graph for ${this.githubData.username || 'user'} showing ${this.githubData.total || 0} contributions`
    );
    this.container.appendChild(this.canvas);
    this.ctx = this.canvas.getContext('2d');

    // Replay button
    this.replayBtn = document.createElement('button');
    this.replayBtn.type = 'button';
    this.replayBtn.className = 'skyline-replay-btn';
    this.replayBtn.innerHTML = `
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/>
        <path d="M3 3v5h5"/>
      </svg>
      <span>Replay</span>
    `;
    this.replayBtn.setAttribute('aria-label', 'Replay contribution wave animation');
    this.replayBtn.addEventListener('click', () => this.replay());
    this.container.appendChild(this.replayBtn);

    // Apply styles to replay button
    Object.assign(this.replayBtn.style, {
      position: 'absolute',
      top: '12px',
      right: '12px',
      display: 'inline-flex',
      alignItems: 'center',
      gap: '6px',
      padding: '6px 12px',
      background: 'rgba(255, 255, 255, 0.06)',
      backdropFilter: 'blur(8px)',
      webkitBackdropFilter: 'blur(8px)',
      border: '1px solid rgba(255, 255, 255, 0.12)',
      borderRadius: '8px',
      color: '#e0e0e0',
      fontFamily: '"JetBrains Mono", monospace, sans-serif',
      fontSize: '12px',
      fontWeight: '500',
      cursor: 'pointer',
      transition: 'all 0.2s ease',
      zIndex: '10',
      outline: 'none',
    });

    this.replayBtn.addEventListener('mouseenter', () => {
      this.replayBtn.style.background = 'rgba(64, 196, 99, 0.18)';
      this.replayBtn.style.borderColor = 'rgba(64, 196, 99, 0.5)';
      this.replayBtn.style.color = '#ffffff';
    });

    this.replayBtn.addEventListener('mouseleave', () => {
      this.replayBtn.style.background = 'rgba(255, 255, 255, 0.06)';
      this.replayBtn.style.borderColor = 'rgba(255, 255, 255, 0.12)';
      this.replayBtn.style.color = '#e0e0e0';
    });

    // Check prefers-reduced-motion
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    this.prefersReducedMotion = mediaQuery.matches;
    mediaQuery.addEventListener('change', (e) => {
      this.prefersReducedMotion = e.matches;
      if (this.prefersReducedMotion) {
        this.stopAnimation();
        this.renderFrame(Infinity);
      } else {
        this.replay();
      }
    });

    // Resize handling with devicePixelRatio (max 2)
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(this.container);
    this.resize();

    // IntersectionObserver: start playing when canvas is 40% in view
    this.setupIntersectionObserver();
  }

  resize() {
    const rect = this.container.getBoundingClientRect();
    const width = Math.floor(rect.width);
    const height = Math.floor(rect.height || (width > 600 ? 320 : 230));

    if (width === 0 || height === 0) return;

    this.width = width;
    this.height = height;

    // devicePixelRatio (max 2)
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = Math.round(width * dpr);
    this.canvas.height = Math.round(height * dpr);
    this.canvas.style.width = `${width}px`;
    this.canvas.style.height = `${height}px`;

    this.ctx.setTransform(1, 0, 0, 1, 0, 0);
    this.ctx.scale(dpr, dpr);

    // Redraw current frame
    if (this.prefersReducedMotion) {
      this.renderFrame(Infinity);
    } else if (this.hasStarted && this.startTime !== null) {
      const elapsed = performance.now() - this.startTime;
      this.renderFrame(elapsed);
    } else {
      // Idle state before view
      this.renderFrame(0);
    }
  }

  setupIntersectionObserver() {
    this.intersectionObserver = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const isIntersecting40 = entry.isIntersecting && entry.intersectionRatio >= 0.4;

          if (isIntersecting40) {
            this.isVisible = true;

            if (this.prefersReducedMotion) {
              this.renderFrame(Infinity);
              return;
            }

            if (!this.hasStarted) {
              this.hasStarted = true;
              this.startTime = performance.now();
            }

            this.startAnimation();
          } else {
            // Only run requestAnimationFrame while visible
            this.isVisible = false;
            this.stopAnimation();
          }
        }
      },
      {
        threshold: [0, 0.4, 1.0],
      }
    );

    this.intersectionObserver.observe(this.container);
  }

  replay() {
    if (this.prefersReducedMotion) {
      this.renderFrame(Infinity);
      return;
    }

    this.hasStarted = true;
    this.startTime = performance.now();
    this.startAnimation();
  }

  startAnimation() {
    this.stopAnimation();
    if (!this.isVisible) return;

    const loop = (now) => {
      if (!this.isVisible) return;

      const elapsed = now - (this.startTime || now);
      this.renderFrame(elapsed);

      // Stop rAF loop after animation fully settles (~4.5s) to save power/battery
      if (elapsed < 4500) {
        this.rafId = requestAnimationFrame(loop);
      } else {
        this.rafId = null;
        this.renderFrame(Infinity);
      }
    };

    this.rafId = requestAnimationFrame(loop);
  }

  stopAnimation() {
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
  }

  renderFrame(t) {
    if (!this.ctx || this.width === 0 || this.height === 0) return;
    this.draw(this.ctx, this.width, this.height, t);
  }

  destroy() {
    this.stopAnimation();
    if (this.resizeObserver) this.resizeObserver.disconnect();
    if (this.intersectionObserver) this.intersectionObserver.disconnect();
    this.container.innerHTML = '';
  }
}
