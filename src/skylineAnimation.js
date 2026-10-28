/**
 * Pure drawing function for GitHub Skyline Contribution Graph in Oblique Projection.
 * 
 * Signature: draw(ctx, w, h, t)
 * 
 * - Oblique projection: front, top, and side faces for each daily contribution box.
 * - Height: proportional to Math.sqrt(count).
 * - Animation: wave rising front row (Saturday) to back row (Sunday).
 * - Leader line: animates to the best day with callout badge after the wave completes.
 * - Colours: GitHub greens (#ebedf0, #9be9a8, #40c463, #30a14e, #216e39).
 * - Pure function: t = milliseconds since start; t = Infinity draws the completed state.
 */

// Shading utility for oblique 3D faces
function hexToRgb(hex) {
  const clean = hex.replace('#', '');
  const bigint = parseInt(clean, 16);
  return {
    r: (bigint >> 16) & 255,
    g: (bigint >> 8) & 255,
    b: bigint & 255,
  };
}

function shadeRgb({ r, g, b }, factor) {
  return `rgb(${Math.round(Math.max(0, Math.min(255, r * factor)))}, ${Math.round(
    Math.max(0, Math.min(255, g * factor))
  )}, ${Math.round(Math.max(0, Math.min(255, b * factor)))})`;
}

// GitHub contribution greens
const COLOR_PALETTE = [
  '#ebedf0', // Level 0: empty days
  '#9be9a8', // Level 1
  '#40c463', // Level 2
  '#30a14e', // Level 3
  '#216e39', // Level 4
];

const PRECOMPUTED_SHADES = COLOR_PALETTE.map((hex, index) => {
  const rgb = hexToRgb(hex);
  if (index === 0) {
    return {
      top: hex,
      front: '#d6d9dc',
      side: '#bec1c5',
      stroke: 'rgba(0, 0, 0, 0.08)',
    };
  }
  return {
    top: hex,
    front: shadeRgb(rgb, 0.82),
    side: shadeRgb(rgb, 0.65),
    stroke: 'rgba(0, 0, 0, 0.18)',
  };
});

// Cubic overshoot easing for a satisfying physical spring when towers rise
function easeOutBack(x) {
  const c1 = 1.5;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2);
}

function formatDate(dateStr) {
  if (!dateStr) return '';
  const [year, month, day] = dateStr.split('-');
  const date = new Date(Number(year), Number(month) - 1, Number(day));
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

/**
 * Creates the draw function bound to GitHub data.
 * @param {Object} data Loaded data/github.json
 * @returns {(ctx: CanvasRenderingContext2D, w: number, h: number, t: number) => void}
 */
export function createSkylineDraw(data) {
  const weeks = data.weeksCount || 53;
  const days = data.days || [];
  const counts = data.counts || [];
  const levels = data.levels || '';
  const bestDay = data.bestDay || { count: 0, weekIndex: 0, dayIndex: 0, date: '' };
  const maxCount = Math.max(...counts, 1);

  // Group days into columns (weeks) and rows (days of week)
  const grid = Array.from({ length: 7 }, () => []);
  for (let i = 0; i < days.length; i++) {
    const day = days[i];
    grid[day.dayIndex][day.weekIndex] = {
      ...day,
      count: counts[i] ?? 0,
      level: Number(levels[i] ?? 0),
    };
  }

  return function draw(ctx, w, h, t) {
    ctx.clearRect(0, 0, w, h);

    if (w <= 0 || h <= 0) return;

    const isReduced = t === Infinity || t >= 5000;

    // Responsive sizing and spacing
    const marginX = Math.max(14, w * 0.04);
    const usableW = w - marginX * 2;
    const stepX = usableW / (weeks + 1.2);
    const boxW = Math.max(2.2, stepX * 0.68);
    const slantX = Math.max(1.2, stepX * 0.28);
    const slantY = Math.max(1.6, slantX * 1.15);

    // Vertical spacing
    const rows = 7;
    const maxTowerH = Math.min(h * 0.42, 90);
    const heightScale = maxTowerH / Math.sqrt(maxCount);
    const baseTileH = Math.max(1.5, Math.min(3, h * 0.012));

    const stepY = Math.max(4.5, (h * 0.38) / (rows - 0.5));
    // Position back row (row 0 = Sunday) so max tower has room on top
    const originY = Math.max(maxTowerH + 60, h * 0.44);

    let bestDayScreenPos = null;
    let bestDayBoxHeight = 0;

    // Wave parameters:
    // Wave starts at front row (row 6: Saturday) and moves to back row (row 0: Sunday)
    const waveStartMs = 120;
    const rowDelayMs = 130;
    const colDelayMs = 260;
    const riseDurationMs = 520;

    // Painter's algorithm: draw from back row (r = 0) to front row (r = 6)
    for (let r = 0; r < rows; r++) {
      const rowFromFront = 6 - r; // row 6 is 0 (first), row 0 is 6 (last)
      const rowList = grid[r] || [];

      for (let c = 0; c < weeks; c++) {
        const cell = rowList[c];
        if (!cell) continue;

        const count = cell.count;
        const level = cell.level;
        const shades = PRECOMPUTED_SHADES[level] || PRECOMPUTED_SHADES[0];

        // Target height based on square root of the count
        const targetH = count === 0 ? baseTileH : baseTileH + Math.sqrt(count) * heightScale;

        // Wave animation progress
        let progress = 1.0;
        if (!isReduced) {
          const delay = waveStartMs + rowFromFront * rowDelayMs + (c / weeks) * colDelayMs;
          if (t < delay) {
            progress = 0.0;
          } else if (t < delay + riseDurationMs) {
            const raw = (t - delay) / riseDurationMs;
            progress = easeOutBack(raw);
          } else {
            progress = 1.0;
          }
        }

        // Current height for this box
        const hBox = count === 0 ? baseTileH : baseTileH + (targetH - baseTileH) * Math.max(0, Math.min(1.08, progress));

        // Screen coordinates of base front-left corner
        const x = marginX + c * stepX;
        const y = originY + r * stepY;

        // If this is the best day, record top coordinates for leader line
        if (cell.date === bestDay.date) {
          bestDayBoxHeight = hBox;
          bestDayScreenPos = {
            topCenterX: x + boxW / 2 + slantX / 2,
            topCenterY: y - hBox - slantY / 2,
            x,
            y,
            boxW,
            hBox,
          };
        }

        ctx.lineWidth = 0.6;
        ctx.strokeStyle = shades.stroke;

        // 1. Draw Front face (facing camera)
        ctx.fillStyle = shades.front;
        ctx.fillRect(x, y - hBox, boxW, hBox);
        ctx.strokeRect(x, y - hBox, boxW, hBox);

        // 2. Draw Side face (right face receding obliquely)
        ctx.fillStyle = shades.side;
        ctx.beginPath();
        ctx.moveTo(x + boxW, y);
        ctx.lineTo(x + boxW, y - hBox);
        ctx.lineTo(x + boxW + slantX, y - hBox - slantY);
        ctx.lineTo(x + boxW + slantX, y - slantY);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        // 3. Draw Top face (horizontal oblique top)
        ctx.fillStyle = shades.top;
        ctx.beginPath();
        ctx.moveTo(x, y - hBox);
        ctx.lineTo(x + boxW, y - hBox);
        ctx.lineTo(x + boxW + slantX, y - hBox - slantY);
        ctx.lineTo(x + slantX, y - hBox - slantY);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      }
    }

    // Leader Line to Best Day
    // "rising in a wave front row to back, then a leader line to the best day."
    if (bestDayScreenPos && bestDay.count > 0) {
      const leaderStartMs = waveStartMs + 6 * rowDelayMs + colDelayMs + riseDurationMs + 80;
      const leaderDurationMs = 600;

      let leaderProgress = 1.0;
      if (!isReduced) {
        if (t < leaderStartMs) {
          leaderProgress = 0.0;
        } else if (t < leaderStartMs + leaderDurationMs) {
          leaderProgress = (t - leaderStartMs) / leaderDurationMs;
          leaderProgress = 1 - Math.pow(1 - leaderProgress, 3); // easeOutCubic
        } else {
          leaderProgress = 1.0;
        }
      }

      if (leaderProgress > 0) {
        const { topCenterX, topCenterY } = bestDayScreenPos;

        // Leader line geometry:
        // Anchor point -> upward line -> horizontal line to callout badge
        const stemHeight = Math.max(22, Math.min(38, topCenterY - 40));
        const anchorY = topCenterY;
        const cornerY = Math.max(34, topCenterY - stemHeight);

        // Decide badge direction: if best day is on right half, put badge on left; else right
        const placeOnLeft = topCenterX > w * 0.55;
        const badgeOffset = placeOnLeft ? -18 : 18;
        const cornerX = topCenterX;
        const endX = cornerX + badgeOffset;

        ctx.save();

        // Glowing anchor point on best day
        ctx.fillStyle = '#40c463';
        ctx.shadowColor = 'rgba(64, 196, 99, 0.7)';
        ctx.shadowBlur = 8;
        ctx.beginPath();
        ctx.arc(topCenterX, anchorY, 2.8, 0, Math.PI * 2);
        ctx.fill();

        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(topCenterX, anchorY, 2.8, 0, Math.PI * 2);
        ctx.stroke();

        // Draw leader line progressively
        ctx.shadowColor = 'rgba(64, 196, 99, 0.4)';
        ctx.shadowBlur = 4;
        ctx.strokeStyle = '#30a14e';
        ctx.lineWidth = 1.4;

        const totalDist = stemHeight + Math.abs(badgeOffset);
        const currentDist = totalDist * leaderProgress;

        ctx.beginPath();
        ctx.moveTo(topCenterX, anchorY);

        if (currentDist <= stemHeight) {
          ctx.lineTo(topCenterX, anchorY - currentDist);
        } else {
          ctx.lineTo(topCenterX, cornerY);
          const horizDist = currentDist - stemHeight;
          const horizSign = placeOnLeft ? -1 : 1;
          ctx.lineTo(topCenterX + horizSign * horizDist, cornerY);
        }
        ctx.stroke();
        ctx.restore();

        // Callout Badge: fades and scales in as leader line reaches corner
        if (leaderProgress >= 0.6) {
          const badgeProgress = isReduced ? 1 : Math.min(1, (leaderProgress - 0.6) / 0.4);
          const badgeAlpha = badgeProgress;

          ctx.save();
          ctx.globalAlpha = badgeAlpha;

          // Site fonts: JetBrains Mono and Inter
          const countText = `${bestDay.count} contributions`;
          const dateText = formatDate(bestDay.date);

          const fontSizePrimary = Math.max(10, Math.min(12, w * 0.024));
          const fontSizeSecondary = Math.max(9, Math.min(10.5, w * 0.02));

          ctx.font = `600 ${fontSizePrimary}px "JetBrains Mono", monospace`;
          const countMetrics = ctx.measureText(countText);

          ctx.font = `400 ${fontSizeSecondary}px "Inter", sans-serif`;
          const dateMetrics = ctx.measureText(dateText);

          const badgeW = Math.max(countMetrics.width, dateMetrics.width) + 24;
          const badgeH = fontSizePrimary + fontSizeSecondary + 14;

          let badgeX = placeOnLeft ? endX - badgeW : endX;
          // Keep badge within screen bounds
          badgeX = Math.max(marginX, Math.min(w - marginX - badgeW, badgeX));
          const badgeY = cornerY - badgeH / 2;

          // Badge pill container
          ctx.fillStyle = 'rgba(18, 18, 18, 0.92)';
          ctx.strokeStyle = 'rgba(64, 196, 99, 0.55)';
          ctx.lineWidth = 1;
          ctx.shadowColor = 'rgba(0, 0, 0, 0.4)';
          ctx.shadowBlur = 10;
          ctx.shadowOffsetY = 3;

          const radius = 6;
          ctx.beginPath();
          ctx.roundRect(badgeX, badgeY, badgeW, badgeH, radius);
          ctx.fill();
          ctx.stroke();

          // Green accent pill / dot
          ctx.shadowBlur = 0;
          ctx.shadowOffsetY = 0;
          ctx.fillStyle = '#40c463';
          ctx.beginPath();
          ctx.arc(badgeX + 10, badgeY + badgeH / 2 - 4, 3, 0, Math.PI * 2);
          ctx.fill();

          // Text labels
          ctx.fillStyle = '#ffffff';
          ctx.font = `600 ${fontSizePrimary}px "JetBrains Mono", monospace`;
          ctx.fillText(countText, badgeX + 18, badgeY + fontSizePrimary + 4);

          ctx.fillStyle = '#9be9a8';
          ctx.font = `400 ${fontSizeSecondary}px "Inter", sans-serif`;
          ctx.fillText(dateText, badgeX + 18, badgeY + fontSizePrimary + fontSizeSecondary + 8);

          ctx.restore();
        }
      }
    }
  };
}
