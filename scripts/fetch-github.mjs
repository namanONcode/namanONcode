import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const USERNAME = process.env.GITHUB_USERNAME || 'namanoncode';

function resolveToken() {
  if (process.env.GITHUB_TOKEN && process.env.GITHUB_TOKEN.trim().length > 0) {
    return process.env.GITHUB_TOKEN.trim();
  }
  try {
    const token = execSync('gh auth token', { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'ignore'] }).trim();
    if (token) return token;
  } catch {
    // ignore error
  }
  return null;
}

const LEVEL_MAP = {
  NONE: '0',
  FIRST_QUARTILE: '1',
  SECOND_QUARTILE: '2',
  THIRD_QUARTILE: '3',
  FOURTH_QUARTILE: '4',
};

const query = `
query($login: String!) {
  user(login: $login) {
    contributionsCollection {
      contributionCalendar {
        totalContributions
        weeks {
          contributionDays {
            date
            contributionCount
            contributionLevel
          }
        }
      }
    }
  }
}
`;

async function main() {
  const token = resolveToken();
  if (!token) {
    console.error('Error: GITHUB_TOKEN environment variable is not set and `gh auth token` failed.');
    process.exit(1);
  }

  console.log(`Fetching GitHub contribution calendar for @${USERNAME}...`);

  const response = await fetch('https://api.github.com/graphql', {
    method: 'POST',
    headers: {
      Authorization: `bearer ${token}`,
      'Content-Type': 'application/json',
      'User-Agent': 'skyline-fetcher',
    },
    body: JSON.stringify({
      query,
      variables: { login: USERNAME },
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    console.error(`GitHub API responded with HTTP ${response.status}: ${errText}`);
    process.exit(1);
  }

  const json = await response.json();

  if (json.errors && json.errors.length > 0) {
    console.error('GraphQL Errors:', JSON.stringify(json.errors, null, 2));
    process.exit(1);
  }

  const calendar = json.data?.user?.contributionsCollection?.contributionCalendar;
  if (!calendar) {
    console.error('Failed to extract contributionCalendar from response');
    process.exit(1);
  }

  const total = calendar.totalContributions;
  const weeks = calendar.weeks || [];

  const days = [];
  const counts = [];
  let levels = '';
  let startDate = '';
  let bestDay = { date: '', count: -1, level: 0, index: -1, weekIndex: -1, dayIndex: -1 };

  let dayIndex = 0;
  for (let w = 0; w < weeks.length; w++) {
    const week = weeks[w];
    for (let d = 0; d < week.contributionDays.length; d++) {
      const day = week.contributionDays[d];
      if (!startDate) {
        startDate = day.date;
      }
      const count = day.contributionCount;
      const levelDigit = LEVEL_MAP[day.contributionLevel] || '0';

      counts.push(count);
      levels += levelDigit;

      days.push({
        date: day.date,
        count,
        level: Number.parseInt(levelDigit, 10),
        rawLevel: day.contributionLevel,
        weekIndex: w,
        dayIndex: d,
        index: dayIndex,
      });

      if (count > bestDay.count) {
        bestDay = {
          date: day.date,
          count,
          level: Number.parseInt(levelDigit, 10),
          index: dayIndex,
          weekIndex: w,
          dayIndex: d,
        };
      }

      dayIndex++;
    }
  }

  const outputData = {
    username: USERNAME,
    startDate,
    total,
    counts,
    levels,
    bestDay,
    weeksCount: weeks.length,
    daysCount: days.length,
    days,
    fetchedAt: new Date().toISOString(),
  };

  const dataDir = path.resolve(rootDir, 'data');
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  const outputPath = path.resolve(dataDir, 'github.json');
  fs.writeFileSync(outputPath, JSON.stringify(outputData, null, 2), 'utf-8');

  console.log(`Successfully saved data to ${outputPath}`);
  console.log(`- Start Date: ${startDate}`);
  console.log(`- Total Contributions: ${total}`);
  console.log(`- Total Days: ${counts.length}`);
  console.log(`- Best Day: ${bestDay.date} with ${bestDay.count} contributions`);
}

main().catch((err) => {
  console.error('Fatal error running fetch-github:', err);
  process.exit(1);
});
