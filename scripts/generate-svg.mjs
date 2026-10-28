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
    stroke: 'rgba(0, 0, 0, 0.16)',
  };
});

function formatDate(dateStr) {
  if (!dateStr) return '';
  const [year, month, day] = dateStr.split('-');
  const date = new Date(Number(year), Number(month) - 1, Number(day));
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function generateSvg() {
  const svgWidth = 860;
  const svgHeight = 310;

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

  const marginX = 28;
  const usableW = svgWidth - marginX * 2;
  const stepX = usableW / (weeks + 1.2);
  const boxW = Math.max(3.2, stepX * 0.68);
  const slantX = Math.max(1.8, stepX * 0.28);
  const slantY = Math.max(2.2, slantX * 1.15);

  const rows = 7;
  const maxTowerH = 88;
  const heightScale = maxTowerH / Math.sqrt(maxCount);
  const baseTileH = 2.5;

  const stepY = 14;
  const originY = 145;

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
      const delaySec = (0.12 + rowFromFront * 0.14 + (c / weeks) * 0.28).toFixed(3);

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

      boxesSvg += `
        <g class="box" style="animation-delay: ${delaySec}s; transform-origin: ${x}px ${y}px;">
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
    const stemH = 32;
    const cornerY = +(topCenterY - stemH).toFixed(2);
    const placeOnLeft = topCenterX > svgWidth * 0.55;
    const badgeW = 168;
    const badgeH = 46;
    const badgeOffset = placeOnLeft ? -24 : 24;
    const endX = +(topCenterX + badgeOffset).toFixed(2);
    const badgeX = placeOnLeft ? +(endX - badgeW).toFixed(2) : endX;
    const badgeY = +(cornerY - badgeH / 2).toFixed(2);

    const linePath = `M ${topCenterX} ${topCenterY} L ${topCenterX} ${cornerY} L ${endX} ${cornerY}`;

    leaderSvg = `
      <!-- Leader Line & Callout Badge -->
      <g class="leader-group">
        <!-- Glowing anchor on best day -->
        <circle cx="${topCenterX}" cy="${topCenterY}" r="3.2" fill="#40c463" stroke="#ffffff" stroke-width="1.2" class="anchor-glow" />
        
        <!-- Progressive leader line -->
        <path d="${linePath}" fill="none" stroke="#40c463" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" class="leader-line" />
        
        <!-- Callout Badge -->
        <g class="badge-card" transform="translate(${badgeX}, ${badgeY})">
          <rect width="${badgeW}" height="${badgeH}" rx="8" fill="#161b22" stroke="rgba(64, 196, 99, 0.6)" stroke-width="1.2" />
          <circle cx="14" cy="18" r="4" fill="#40c463" />
          <text x="26" y="21" fill="#ffffff" font-family="'JetBrains Mono', ui-monospace, monospace" font-size="11.5" font-weight="600">${bestDay.count} contributions</text>
          <text x="26" y="36" fill="#9be9a8" font-family="'Inter', -apple-system, sans-serif" font-size="9.5">${formatDate(bestDay.date)} (Best Day)</text>
        </g>
      </g>`;
  }

  const svgContent = `<?xml version="1.0" encoding="UTF-8"?>
<svg width="${svgWidth}" height="${svgHeight}" viewBox="0 0 ${svgWidth} ${svgHeight}" fill="none" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <style>
      @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&amp;family=JetBrains+Mono:wght@500;600;700&amp;display=swap');
      
      .bg {
        fill: #0d1117;
      }
      
      .box {
        animation: waveRise 0.65s cubic-bezier(0.34, 1.56, 0.64, 1) both;
      }
      
      @keyframes waveRise {
        0% {
          opacity: 0;
          transform: translateY(18px) scaleY(0.05);
        }
        70% {
          transform: translateY(-2px) scaleY(1.06);
        }
        100% {
          opacity: 1;
          transform: translateY(0px) scaleY(1);
        }
      }
      
      .leader-group {
        animation: fadeIn 0.4s ease 1.7s both;
      }
      
      .leader-line {
        stroke-dasharray: 140;
        stroke-dashoffset: 140;
        animation: drawLine 0.7s cubic-bezier(0.16, 1, 0.3, 1) 1.75s forwards;
      }
      
      @keyframes drawLine {
        to {
          stroke-dashoffset: 0;
        }
      }
      
      .badge-card {
        opacity: 0;
        animation: popBadge 0.5s cubic-bezier(0.175, 0.885, 0.32, 1.275) 2.1s forwards;
        transform-origin: 0% 50%;
      }
      
      @keyframes popBadge {
        0% {
          opacity: 0;
          transform: translateY(4px) scale(0.92);
        }
        100% {
          opacity: 1;
          transform: translateY(0) scale(1);
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
  </defs>

  <!-- Background Panel -->
  <rect width="${svgWidth}" height="${svgHeight}" rx="14" fill="#0d1117" stroke="rgba(255, 255, 255, 0.08)" stroke-width="1" />
  
  <!-- Header / Metadata -->
  <g transform="translate(28, 28)">
    <text x="0" y="0" fill="#e0e0e0" font-family="'JetBrains Mono', ui-monospace, monospace" font-size="14" font-weight="600">@${data.username} / 3D Skyline Contributions</text>
    <text x="0" y="18" fill="#8b949e" font-family="'Inter', -apple-system, sans-serif" font-size="11">${data.total.toLocaleString()} total contributions across ${data.daysCount} days (${formatDate(data.startDate)} – Present)</text>
  </g>

  <!-- Legend -->
  <g transform="translate(${svgWidth - 195}, 22)">
    <text x="0" y="10" fill="#8b949e" font-family="'Inter', -apple-system, sans-serif" font-size="10">Less</text>
    <rect x="30" y="0" width="11" height="11" rx="2" fill="#ebedf0" />
    <rect x="45" y="0" width="11" height="11" rx="2" fill="#9be9a8" />
    <rect x="60" y="0" width="11" height="11" rx="2" fill="#40c463" />
    <rect x="75" y="0" width="11" height="11" rx="2" fill="#30a14e" />
    <rect x="90" y="0" width="11" height="11" rx="2" fill="#216e39" />
    <text x="108" y="10" fill="#8b949e" font-family="'Inter', -apple-system, sans-serif" font-size="10">More</text>
  </g>

  <!-- 3D Skyline Oblique Grid -->
  <g id="skyline-grid">
    ${boxesSvg}
  </g>

  <!-- Leader Annotation -->
  ${leaderSvg}
</svg>`;

  const outputPath = path.resolve(rootDir, 'skyline.svg');
  fs.writeFileSync(outputPath, svgContent, 'utf-8');
  console.log(`Generated SVG skyline animation at: ${outputPath}`);
}

generateSvg();
