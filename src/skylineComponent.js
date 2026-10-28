/**
 * Client component for GitHub Skyline Contribution Graph animation.
 * Light Mode Theme with Mouse Hover Interactivity.
 * 
 * Requirements satisfied:
 * - One canvas that fills its box at devicePixelRatio (max 2).
 * - Pure function draw(ctx, w, h, t, hoveredDay) where t is milliseconds since start.
 * - Interactive hover: highlights the tower and displays dynamic tooltip.
 * - Light mode styling with clean GitHub theme.
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
    this.hoveredDay = null;

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

    // Replay button in Light Mode
    this.replayBtn = document.createElement('button');
    this.replayBtn.type = 'button';
    this.replayBtn.className = 'skyline-replay-btn';
    this.replayBtn.innerHTML = `
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/>
        <path d="M3 3v5h5"/>
      </svg>
      <span>Replay</span>
    `;
    this.replayBtn.setAttribute('aria-label', 'Replay contribution wave animation');
    this.replayBtn.addEventListener('click', () => this.replay());
    this.container.appendChild(this.replayBtn);

    // Apply Light Mode styles to replay button
    Object.assign(this.replayBtn.style, {
      position: 'absolute',
      top: '12px',
      right: '12px',
      display: 'inline-flex',
      alignItems: 'center',
      gap: '6px',
      padding: '5px 12px',
      background: 'rgba(255, 255, 255, 0.9)',
      backdropFilter: 'blur(8px)',
      webkitBackdropFilter: 'blur(8px)',
      border: '1px solid #d0d7de',
      borderRadius: '6px',
      color: '#24292f',
      boxShadow: '0 1px 3px rgba(31, 35, 40, 0.08)',
      fontFamily: '"JetBrains Mono", monospace, sans-serif',
      fontSize: '11.5px',
      fontWeight: '600',
      cursor: 'pointer',
      transition: 'all 0.18s ease',
      zIndex: '10',
      outline: 'none',
    });

    this.replayBtn.addEventListener('mouseenter', () => {
      this.replayBtn.style.background = '#f3f4f6';
      this.replayBtn.style.borderColor = '#1a7f37';
      this.replayBtn.style.color = '#1a7f37';
    });

    this.replayBtn.addEventListener('mouseleave', () => {
      this.replayBtn.style.background = 'rgba(255, 255, 255, 0.9)';
      this.replayBtn.style.borderColor = '#d0d7de';
      this.replayBtn.style.color = '#24292f';
    });

    // Mouse hover interactivity
    this.canvas.addEventListener('mousemove', (e) => this.handleMouseMove(e));
    this.canvas.addEventListener('mouseleave', () => this.handleMouseLeave());
    this.canvas.addEventListener('touchmove', (e) => this.handleTouch(e), { passive: true });
    this.canvas.addEventListener('touchend', () => this.handleMouseLeave());

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

  handleMouseMove(e) {
    const rect = this.canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;

    const hit = this.findDayAt(mx, my);
    if (hit !== this.hoveredDay) {
      this.hoveredDay = hit;
      this.canvas.style.cursor = hit ? 'pointer' : 'default';
      this.redrawCurrent();
    }
  }

  handleTouch(e) {
    if (!e.touches || e.touches.length === 0) return;
    const touch = e.touches[0];
    const rect = this.canvas.getBoundingClientRect();
    const mx = touch.clientX - rect.left;
    const my = touch.clientY - rect.top;

    const hit = this.findDayAt(mx, my);
    if (hit !== this.hoveredDay) {
      this.hoveredDay = hit;
      this.redrawCurrent();
    }
  }

  handleMouseLeave() {
    if (this.hoveredDay !== null) {
      this.hoveredDay = null;
      this.canvas.style.cursor = 'default';
      this.redrawCurrent();
    }
  }

  findDayAt(mx, my) {
    const days = this.githubData?.days;
    if (!days || days.length === 0 || this.width === 0 || this.height === 0) return null;

    const weeks = this.githubData.weeksCount || 53;
    const marginX = Math.max(16, this.width * 0.038);
    const usableW = this.width - marginX * 2;
    const stepX = usableW / (weeks + 1.2);
    const boxW = Math.max(2.4, stepX * 0.68);
    const slantX = Math.max(1.4, stepX * 0.28);
    const slantY = Math.max(1.8, slantX * 1.15);

    const rows = 7;
    const maxTowerH = Math.min(this.height * 0.42, 85);
    const heightScale = maxTowerH / Math.sqrt(Math.max(...(this.githubData.counts || [1])));
    const baseTileH = Math.max(1.6, Math.min(3, this.height * 0.012));
    const stepY = Math.max(4.8, (this.height * 0.36) / (rows - 0.5));
    const originY = Math.max(maxTowerH + 54, this.height * 0.46);

    // Hit-test in reverse drawing order (front row to back row, right to left)
    for (let r = rows - 1; r >= 0; r--) {
      for (let c = weeks - 1; c >= 0; c--) {
        const index = c * 7 + r;
        const cell = days.find((d) => d.weekIndex === c && d.dayIndex === r);
        if (!cell) continue;

        const count = cell.count;
        const targetH = count === 0 ? baseTileH : baseTileH + Math.sqrt(count) * heightScale;
        const x = marginX + c * stepX;
        const y = originY + r * stepY;

        // Check if point is inside box's bounds
        const minX = x;
        const maxX = x + boxW + slantX;
        const minY = y - targetH - slantY;
        const maxY = y;

        if (mx >= minX && mx <= maxX && my >= minY && my <= maxY) {
          return cell;
        }
      }
    }

    return null;
  }

  redrawCurrent() {
    if (this.prefersReducedMotion || (this.hasStarted && performance.now() - this.startTime >= 4500)) {
      this.renderFrame(Infinity);
    } else if (this.hasStarted && this.startTime !== null) {
      this.renderFrame(performance.now() - this.startTime);
    } else {
      this.renderFrame(0);
    }
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
    this.draw(this.ctx, this.width, this.height, t, this.hoveredDay);
  }

  destroy() {
    this.stopAnimation();
    if (this.resizeObserver) this.resizeObserver.disconnect();
    if (this.intersectionObserver) this.intersectionObserver.disconnect();
    this.container.innerHTML = '';
  }
}
