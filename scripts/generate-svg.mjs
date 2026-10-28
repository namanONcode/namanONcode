import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const dataPath = path.resolve(rootDir, 'data/github.json');
if (!fs.existsSync(dataPath)) {
  console.error('data/github.json does not exist. Run fetch-github.mjs first.');
  process.exit(1);
}

const data = JSON.parse(fs.readFileSync(dataPath, 'utf-8'));

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

function formatDate(dateStr) {
  if (!dateStr) return '';
  const [year, month, day] = dateStr.split('-');
  const date = new Date(Number(year), Number(month) - 1, Number(day));
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function generateSvg() {
  const svgWidth = 880;
  const svgHeight = 330;

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

  const marginX = 30;
  const usableW = svgWidth - marginX * 2;
  const stepX = usableW / (weeks + 1.2);
  const boxW = Math.max(3.2, stepX * 0.68);
  const slantX = Math.max(1.8, stepX * 0.28);
  const slantY = Math.max(2.2, slantX * 1.15);

  const rows = 7;
  const maxTowerH = 82;
  const heightScale = maxTowerH / Math.sqrt(maxCount);
  const baseTileH = 2.5;

  const stepY = 14;
  const originY = 168;

  let bestDayCoords = null;
  let boxesSvg = '';

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

      // Wave animation delay: front row (row 6) rises first, then row 5..0
      const delaySec = (0.1 + rowFromFront * 0.12 + (c / weeks) * 0.25).toFixed(3);

      const x = +(marginX + c * stepX).toFixed(2);
      const y = +(originY + r * stepY).toFixed(2);
      const h = +targetH.toFixed(2);

      if (cell.date === bestDay.date) {
        bestDayCoords = {
          topCenterX: +(x + boxW / 2 + slantX / 2).toFixed(2),
          topCenterY: +(y - h - slantY / 2).toFixed(2),
          x,
          y,
          h,
          boxW,
        };
      }

      // 3D Oblique Faces
      // Front face
      const frontPath = `M ${x} ${y} L ${+(x + boxW).toFixed(2)} ${y} L ${+(x + boxW).toFixed(2)} ${+(y - h).toFixed(2)} L ${x} ${+(y - h).toFixed(2)} Z`;
      // Side face (right side)
      const sidePath = `M ${+(x + boxW).toFixed(2)} ${y} L ${+(x + boxW).toFixed(2)} ${+(y - h).toFixed(2)} L ${+(x + boxW + slantX).toFixed(2)} ${+(y - h - slantY).toFixed(2)} L ${+(x + boxW + slantX).toFixed(2)} ${+(y - slantY).toFixed(2)} Z`;
      // Top face
      const topPath = `M ${x} ${+(y - h).toFixed(2)} L ${+(x + boxW).toFixed(2)} ${+(y - h).toFixed(2)} L ${+(x + boxW + slantX).toFixed(2)} ${+(y - h - slantY).toFixed(2)} L ${+(x + slantX).toFixed(2)} ${+(y - h - slantY).toFixed(2)} Z`;

      const tooltipText = `${formatDate(cell.date)}: ${count} contribution${count === 1 ? '' : 's'}`;

      boxesSvg += `
        <g class="box" style="animation-delay: ${delaySec}s; transform-origin: ${x}px ${y}px;" data-count="${count}" data-date="${cell.date}">
          <title>${tooltipText}</title>
          <path d="${frontPath}" fill="${shades.front}" stroke="${shades.stroke}" stroke-width="0.5" />
          <path d="${sidePath}" fill="${shades.side}" stroke="${shades.stroke}" stroke-width="0.5" />
          <path d="${topPath}" fill="${shades.top}" stroke="${shades.stroke}" stroke-width="0.5" />
        </g>`;
    }
  }

  // Leader Line and Callout Badge for Best Day
  let leaderSvg = '';
  if (bestDayCoords && bestDay.count > 0) {
    const { topCenterX, topCenterY } = bestDayCoords;
    const stemH = 36;
    const cornerY = +(topCenterY - stemH).toFixed(2);
    
    // Position badge on the left of the best day column
    const placeOnLeft = topCenterX > svgWidth * 0.55;
    const badgeW = 168;
    const badgeH = 44;
    
    // Leader line connects directly to badge edge
    let endX;
    let badgeX;
    let badgeY = +(cornerY - badgeH / 2).toFixed(2);

    if (placeOnLeft) {
      endX = +(topCenterX - 28).toFixed(2);
      badgeX = +(endX - badgeW).toFixed(2);
    } else {
      endX = +(topCenterX + 28).toFixed(2);
      badgeX = endX;
    }

    const linePath = `M ${topCenterX} ${topCenterY} L ${topCenterX} ${cornerY} L ${endX} ${cornerY}`;

    leaderSvg = `
      <!-- Leader Line & Callout Badge -->
      <g class="leader-group">
        <!-- Glowing anchor ring on top of best day tower -->
        <circle cx="${topCenterX}" cy="${topCenterY}" r="3.2" fill="#30a14e" stroke="#ffffff" stroke-width="1.4" class="anchor-glow" />
        
        <!-- Progressive leader line connecting to badge edge -->
        <path d="${linePath}" fill="none" stroke="#216e39" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" class="leader-line" />
        
        <!-- Anchored Callout Badge in Light Mode -->
        <g transform="translate(${badgeX}, ${badgeY})">
          <g class="badge-card">
            <!-- Filter drop shadow -->
            <rect width="${badgeW}" height="${badgeH}" rx="8" fill="#ffffff" stroke="rgba(48, 161, 78, 0.45)" stroke-width="1.2" filter="url(#shadow)" />
            <!-- Green indicator dot -->
            <circle cx="15" cy="17" r="4" fill="#30a14e" />
            <!-- Main label -->
            <text x="27" y="20" fill="#1f2328" font-family="'JetBrains Mono', ui-monospace, monospace" font-size="11.5" font-weight="600">${bestDay.count} contributions</text>
            <!-- Secondary date label -->
            <text x="27" y="34" fill="#1a7f37" font-family="'Inter', -apple-system, sans-serif" font-size="9.5" font-weight="500">${formatDate(bestDay.date)} (Best Day)</text>
          </g>
        </g>
      </g>`;
  }

  const svgContent = `<?xml version="1.0" encoding="UTF-8"?>
<svg width="${svgWidth}" height="${svgHeight}" viewBox="0 0 ${svgWidth} ${svgHeight}" fill="none" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <style>
      @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&amp;family=JetBrains+Mono:wght@500;600;700&amp;display=swap');
      
      .box {
        animation: waveRise 0.65s cubic-bezier(0.34, 1.56, 0.64, 1) both;
        cursor: pointer;
        transition: filter 0.18s ease, transform 0.18s ease;
      }
      
      .box:hover {
        filter: brightness(1.18) drop-shadow(0 4px 6px rgba(0, 0, 0, 0.22));
      }

      .box:hover path {
        stroke: #1f2328;
        stroke-width: 0.9px;
      }
      
      @keyframes waveRise {
        0% {
          opacity: 0;
          transform: translateY(16px) scaleY(0.05);
        }
        70% {
          transform: translateY(-2px) scaleY(1.05);
        }
        100% {
          opacity: 1;
          transform: translateY(0px) scaleY(1);
        }
      }
      
      .leader-group {
        animation: fadeIn 0.4s ease 1.6s both;
      }
      
      .leader-line {
        stroke-dasharray: 160;
        stroke-dashoffset: 160;
        animation: drawLine 0.65s cubic-bezier(0.16, 1, 0.3, 1) 1.65s forwards;
      }
      
      @keyframes drawLine {
        to {
          stroke-dashoffset: 0;
        }
      }
      
      .badge-card {
        opacity: 0;
        animation: popBadge 0.45s cubic-bezier(0.175, 0.885, 0.32, 1.275) 1.95s forwards;
        transform-origin: 50% 50%;
      }
      
      @keyframes popBadge {
        0% {
          opacity: 0;
          transform: scale(0.92);
        }
        100% {
          opacity: 1;
          transform: scale(1);
        }
      }
      
      @keyframes fadeIn {
        from { opacity: 0; }
        to { opacity: 1; }
      }

      @media (prefers-reduced-motion: reduce) {
        .box {
          animation: none !important;
          opacity: 1 !important;
          transform: none !important;
        }
        .leader-group, .leader-line, .badge-card {
          animation: none !important;
          opacity: 1 !important;
          stroke-dashoffset: 0 !important;
          transform: none !important;
        }
      }
    </style>

    <filter id="shadow" x="-10%" y="-20%" width="125%" height="150%" filterUnits="userSpaceOnUse">
      <feDropShadow dx="0" dy="3" stdDeviation="5" flood-color="#000000" flood-opacity="0.1" />
      <feDropShadow dx="0" dy="1" stdDeviation="1" flood-color="#000000" flood-opacity="0.05" />
    </filter>
  </defs>

  <!-- Light Mode Background Panel -->
  <rect width="${svgWidth}" height="${svgHeight}" rx="14" fill="#ffffff" stroke="#d1d9e0" stroke-width="1" />
  
  <!-- Header / Metadata in Light Mode -->
  <g transform="translate(30, 30)">
    <text x="0" y="0" fill="#1f2328" font-family="'JetBrains Mono', ui-monospace, monospace" font-size="14.5" font-weight="700">@${data.username} / 3D Skyline Contributions</text>
    <text x="0" y="19" fill="#656d76" font-family="'Inter', -apple-system, sans-serif" font-size="11.5">${data.total.toLocaleString()} total contributions across ${data.daysCount} days (${formatDate(data.startDate)} – Present)</text>
  </g>

  <!-- Legend in Light Mode -->
  <g transform="translate(${svgWidth - 200}, 24)">
    <text x="0" y="11" fill="#656d76" font-family="'Inter', -apple-system, sans-serif" font-size="10.5">Less</text>
    <rect x="30" y="0" width="12" height="12" rx="2" fill="#ebedf0" stroke="rgba(27,31,36,0.15)" stroke-width="0.8" />
    <rect x="46" y="0" width="12" height="12" rx="2" fill="#9be9a8" stroke="rgba(27,31,36,0.15)" stroke-width="0.8" />
    <rect x="62" y="0" width="12" height="12" rx="2" fill="#40c463" stroke="rgba(27,31,36,0.15)" stroke-width="0.8" />
    <rect x="78" y="0" width="12" height="12" rx="2" fill="#30a14e" stroke="rgba(27,31,36,0.15)" stroke-width="0.8" />
    <rect x="94" y="0" width="12" height="12" rx="2" fill="#216e39" stroke="rgba(27,31,36,0.15)" stroke-width="0.8" />
    <text x="114" y="11" fill="#656d76" font-family="'Inter', -apple-system, sans-serif" font-size="10.5">More</text>
  </g>

  <!-- 3D Skyline Oblique Grid -->
  <g id="skyline-grid">
    ${boxesSvg}
  </g>

  <!-- Leader Annotation and Callout Badge -->
  ${leaderSvg}
</svg>`;

  const outputPath = path.resolve(rootDir, 'skyline.svg');
  fs.writeFileSync(outputPath, svgContent, 'utf-8');
  console.log(`Generated Light Mode SVG skyline animation at: ${outputPath}`);
}

generateSvg();
