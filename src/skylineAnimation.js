/**
 * Pure drawing function for GitHub Skyline Contribution Graph in Oblique Projection.
 * Light Mode Theme with Hover Interactivity.
 * 
 * Signature: draw(ctx, w, h, t, hoveredDay)
 * 
 * - Oblique projection: front, top, and side faces for each daily contribution box.
 * - Height: proportional to Math.sqrt(count).
 * - Animation: wave rising front row (Saturday) to back row (Sunday).
 * - Leader line: animates to the best day with callout badge after the wave completes.
 * - Colours: Light mode GitHub greens (#ebedf0, #9be9a8, #40c463, #30a14e, #216e39).
 * - Interactivity: renders hovered day highlight and floating tooltip when hoveredDay is passed.
 * - Pure function: t = milliseconds since start; t = Infinity draws the completed state.
 */

// GitHub contribution greens in Light Mode
const COLOR_PALETTE = [
  '#ebedf0', // Level 0: empty days
  '#9be9a8', // Level 1
  '#40c463', // Level 2
  '#30a14e', // Level 3
  '#216e39', // Level 4
];

const PRECOMPUTED_SHADES = [
  // Level 0: empty days
  {
    top: '#ebedf0',
    front: '#d0d7de',
    side: '#bcc3ce',
    stroke: 'rgba(27, 31, 36, 0.12)',
  },
  // Level 1
  {
    top: '#9be9a8',
    front: '#7ad488',
    side: '#62bf71',
    stroke: 'rgba(27, 31, 36, 0.12)',
  },
  // Level 2
  {
    top: '#40c463',
    front: '#31a953',
    side: '#268c42',
    stroke: 'rgba(27, 31, 36, 0.14)',
  },
  // Level 3
  {
    top: '#30a14e',
    front: '#258840',
    side: '#1c6f33',
    stroke: 'rgba(27, 31, 36, 0.16)',
  },
  // Level 4
  {
    top: '#216e39',
    front: '#19582d',
    side: '#124522',
    stroke: 'rgba(27, 31, 36, 0.18)',
  },
];

// Cubic overshoot easing for a satisfying physical spring when towers rise
function easeOutBack(x) {
  const c1 = 1.4;
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
 * @returns {(ctx: CanvasRenderingContext2D, w: number, h: number, t: number, hoveredDay?: Object) => void}
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

  return function draw(ctx, w, h, t, hoveredDay = null) {
    ctx.clearRect(0, 0, w, h);

    if (w <= 0 || h <= 0) return;

    const isReduced = t === Infinity || t >= 4500;

    // Responsive sizing and spacing
    const marginX = Math.max(16, w * 0.038);
    const usableW = w - marginX * 2;
    const stepX = usableW / (weeks + 1.2);
    const boxW = Math.max(2.4, stepX * 0.68);
    const slantX = Math.max(1.4, stepX * 0.28);
    const slantY = Math.max(1.8, slantX * 1.15);

    // Vertical spacing
    const rows = 7;
    const maxTowerH = Math.min(h * 0.42, 85);
    const heightScale = maxTowerH / Math.sqrt(maxCount);
    const baseTileH = Math.max(1.6, Math.min(3, h * 0.012));

    const stepY = Math.max(4.8, (h * 0.36) / (rows - 0.5));
    // Position back row (row 0 = Sunday) so max tower has breathing room
    const originY = Math.max(maxTowerH + 54, h * 0.46);

    let bestDayScreenPos = null;
    let hoveredScreenPos = null;

    // Wave parameters:
    // Wave starts at front row (row 6: Saturday) and moves to back row (row 0: Sunday)
    const waveStartMs = 100;
    const rowDelayMs = 120;
    const colDelayMs = 240;
    const riseDurationMs = 500;

    // Painter's algorithm: draw from back row (r = 0, Sunday) to front row (r = 6, Saturday)
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
        const hBox = count === 0 ? baseTileH : baseTileH + (targetH - baseTileH) * Math.max(0, Math.min(1.06, progress));

        // Screen coordinates of base front-left corner
        const x = marginX + c * stepX;
        const y = originY + r * stepY;

        const isHovered = hoveredDay && hoveredDay.date === cell.date;

        // Record best day coordinates
        if (cell.date === bestDay.date) {
          bestDayScreenPos = {
            topCenterX: x + boxW / 2 + slantX / 2,
            topCenterY: y - hBox - slantY / 2,
            x,
            y,
            boxW,
            hBox,
          };
        }

        if (isHovered) {
          hoveredScreenPos = {
            x,
            y,
            boxW,
            hBox,
            slantX,
            slantY,
            cell,
            topCenterX: x + boxW / 2 + slantX / 2,
            topCenterY: y - hBox - slantY / 2,
          };
        }

        // Draw facets
        ctx.lineWidth = isHovered ? 1.2 : 0.5;
        ctx.strokeStyle = isHovered ? '#1f2328' : shades.stroke;

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

    // Leader Line and Callout Badge to Best Day
    if (bestDayScreenPos && bestDay.count > 0) {
      const leaderStartMs = waveStartMs + 6 * rowDelayMs + colDelayMs + riseDurationMs + 60;
      const leaderDurationMs = 550;

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

        // Leader line geometry
        const stemHeight = Math.max(22, Math.min(36, topCenterY - 34));
        const anchorY = topCenterY;
        const cornerY = Math.max(28, topCenterY - stemHeight);

        // Place badge to the left if in right half of screen
        const placeOnLeft = topCenterX > w * 0.55;
        const badgeW = 164;
        const badgeH = 42;
        const badgeOffset = placeOnLeft ? -24 : 24;
        const endX = topCenterX + badgeOffset;

        ctx.save();

        // Glowing anchor dot on best day
        ctx.fillStyle = '#30a14e';
        ctx.shadowColor = 'rgba(48, 161, 78, 0.4)';
        ctx.shadowBlur = 6;
        ctx.beginPath();
        ctx.arc(topCenterX, anchorY, 3, 0, Math.PI * 2);
        ctx.fill();

        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.arc(topCenterX, anchorY, 3, 0, Math.PI * 2);
        ctx.stroke();

        // Draw leader line progressively
        ctx.shadowColor = 'rgba(0, 0, 0, 0.08)';
        ctx.shadowBlur = 3;
        ctx.strokeStyle = '#216e39';
        ctx.lineWidth = 1.6;

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

        // Callout Badge in Light Mode
        if (leaderProgress >= 0.55) {
          const badgeProgress = isReduced ? 1 : Math.min(1, (leaderProgress - 0.55) / 0.45);
          ctx.save();
          ctx.globalAlpha = badgeProgress;

          const countText = `${bestDay.count} contributions`;
          const dateText = `${formatDate(bestDay.date)} (Best Day)`;

          const fontSizePrimary = Math.max(10, Math.min(11.5, w * 0.022));
          const fontSizeSecondary = Math.max(8.5, Math.min(9.5, w * 0.018));

          let badgeX = placeOnLeft ? endX - badgeW : endX;
          badgeX = Math.max(marginX, Math.min(w - marginX - badgeW, badgeX));
          const badgeY = cornerY - badgeH / 2;

          // Light Mode Badge card container
          ctx.fillStyle = '#ffffff';
          ctx.strokeStyle = 'rgba(48, 161, 78, 0.5)';
          ctx.lineWidth = 1.2;
          ctx.shadowColor = 'rgba(0, 0, 0, 0.08)';
          ctx.shadowBlur = 12;
          ctx.shadowOffsetY = 3;

          ctx.beginPath();
          ctx.roundRect(badgeX, badgeY, badgeW, badgeH, 8);
          ctx.fill();
          ctx.stroke();

          // Green accent indicator
          ctx.shadowBlur = 0;
          ctx.shadowOffsetY = 0;
          ctx.fillStyle = '#30a14e';
          ctx.beginPath();
          ctx.arc(badgeX + 13, badgeY + 16, 3.5, 0, Math.PI * 2);
          ctx.fill();

          // Text labels in Light Mode
          ctx.fillStyle = '#1f2328';
          ctx.font = `600 ${fontSizePrimary}px "JetBrains Mono", monospace`;
          ctx.fillText(countText, badgeX + 24, badgeY + 19);

          ctx.fillStyle = '#1a7f37';
          ctx.font = `500 ${fontSizeSecondary}px "Inter", sans-serif`;
          ctx.fillText(dateText, badgeX + 24, badgeY + 33);

          ctx.restore();
        }
      }
    }

    // Hover Tooltip
    if (hoveredScreenPos) {
      const { topCenterX, topCenterY, cell } = hoveredScreenPos;
      const count = cell.count;
      const dateStr = formatDate(cell.date);
      const tipText = `${dateStr}: ${count} contribution${count === 1 ? '' : 's'}`;

      ctx.save();
      ctx.font = '500 11px "JetBrains Mono", monospace';
      const textMetrics = ctx.measureText(tipText);
      const tipW = textMetrics.width + 18;
      const tipH = 28;

      let tipX = topCenterX - tipW / 2;
      tipX = Math.max(10, Math.min(w - tipW - 10, tipX));
      const tipY = Math.max(8, topCenterY - tipH - 10);

      // Tooltip box
      ctx.fillStyle = '#1f2328';
      ctx.shadowColor = 'rgba(0, 0, 0, 0.2)';
      ctx.shadowBlur = 8;
      ctx.shadowOffsetY = 2;
      ctx.beginPath();
      ctx.roundRect(tipX, tipY, tipW, tipH, 6);
      ctx.fill();

      // Tooltip arrow
      ctx.shadowBlur = 0;
      ctx.shadowOffsetY = 0;
      ctx.beginPath();
      ctx.moveTo(topCenterX - 4, tipY + tipH);
      ctx.lineTo(topCenterX, tipY + tipH + 4);
      ctx.lineTo(topCenterX + 4, tipY + tipH);
      ctx.fill();

      // Tooltip text
      ctx.fillStyle = '#ffffff';
      ctx.fillText(tipText, tipX + 9, tipY + 18);
      ctx.restore();
    }
  };
}
