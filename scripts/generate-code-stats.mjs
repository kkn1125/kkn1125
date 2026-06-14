import { readFile, writeFile } from "node:fs/promises";

const username = process.env.GITHUB_REPOSITORY_OWNER || "kkn1125";
const token = process.env.GITHUB_TOKEN;
const apiHeaders = {
  Accept: "application/vnd.github+json",
  "User-Agent": `${username}-profile-readme`,
  "X-GitHub-Api-Version": "2022-11-28",
  ...(token ? { Authorization: `Bearer ${token}` } : {}),
};

const languageColors = {
  JavaScript: "#F7DF1E",
  TypeScript: "#3178C6",
  Java: "#B07219",
  Python: "#3572A5",
  HTML: "#E34C26",
  CSS: "#563D7C",
  SCSS: "#C6538C",
  Vue: "#41B883",
  Shell: "#89E051",
  Dockerfile: "#384D54",
  Kotlin: "#A97BFF",
  PHP: "#4F5D95",
  C: "#555555",
  "C++": "#F34B7D",
};

const escapeXml = (value) =>
  String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");

const truncate = (value, maxLength) =>
  value.length > maxLength ? `${value.slice(0, maxLength - 1)}…` : value;

async function github(path) {
  const response = await fetch(`https://api.github.com${path}`, {
    headers: apiHeaders,
  });

  if (!response.ok) {
    throw new Error(`GitHub API ${response.status}: ${await response.text()}`);
  }

  return {
    data: await response.json(),
    link: response.headers.get("link"),
  };
}

async function fetchRepositories() {
  const repositories = [];
  let page = 1;

  while (true) {
    const { data, link } = await github(
      `/users/${username}/repos?per_page=100&page=${page}&type=owner&sort=updated`,
    );
    repositories.push(...data);

    if (!link?.includes('rel="next"')) break;
    page += 1;
  }

  return repositories.filter(
    (repository) =>
      !repository.fork &&
      !repository.archived &&
      repository.name !== username,
  );
}

async function fetchLanguageTotals(repositories) {
  const totals = new Map();
  const chunkSize = 10;

  for (let index = 0; index < repositories.length; index += chunkSize) {
    const chunk = repositories.slice(index, index + chunkSize);
    const results = await Promise.all(
      chunk.map((repository) => github(`/repos/${repository.full_name}/languages`)),
    );

    for (const { data } of results) {
      for (const [language, bytes] of Object.entries(data)) {
        totals.set(language, (totals.get(language) || 0) + bytes);
      }
    }
  }

  return [...totals.entries()]
    .map(([name, bytes]) => ({ name, bytes }))
    .sort((left, right) => right.bytes - left.bytes);
}

function formatBytes(bytes) {
  if (bytes >= 1_000_000_000) return `${(bytes / 1_000_000_000).toFixed(1)} GB`;
  if (bytes >= 1_000_000) return `${(bytes / 1_000_000).toFixed(1)} MB`;
  return `${(bytes / 1_000).toFixed(1)} KB`;
}

function renderSvg(repositories, languages, approximate = false) {
  const totalBytes = languages.reduce((sum, language) => sum + language.bytes, 0);
  const visibleLanguages = languages.slice(0, 7);
  const recentRepositories = repositories
    .filter((repository) => repository.language)
    .slice(0, 5);
  const updatedAt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());

  let barOffset = 0;
  const segments = visibleLanguages
    .map((language, index) => {
      const width = (language.bytes / totalBytes) * 920;
      const segment = `<rect x="${140 + barOffset}" y="203" width="${Math.max(width, 2).toFixed(2)}" height="18" fill="${languageColors[language.name] || `hsl(${(index * 47 + 190) % 360} 70% 62%)`}"/>`;
      barOffset += width;
      return segment;
    })
    .join("\n");

  const languageRows = visibleLanguages
    .map((language, index) => {
      const x = index < 4 ? 140 : 510;
      const y = 268 + (index % 4) * 44;
      const percentage = ((language.bytes / totalBytes) * 100).toFixed(1);
      const color =
        languageColors[language.name] ||
        `hsl(${(index * 47 + 190) % 360} 70% 62%)`;

      return `
        <circle cx="${x + 5}" cy="${y - 5}" r="5" fill="${color}"/>
        <text x="${x + 20}" y="${y}" class="label">${escapeXml(language.name)}</text>
        <text x="${x + 245}" y="${y}" text-anchor="end" class="value">${percentage}%</text>`;
    })
    .join("");

  const repositoryRows = recentRepositories
    .map((repository, index) => {
      const y = 268 + index * 44;
      const color = languageColors[repository.language] || "#64748B";

      return `
        <circle cx="865" cy="${y - 5}" r="5" fill="${color}"/>
        <text x="880" y="${y}" class="repo">${escapeXml(truncate(repository.name, 25))}</text>
        <text x="1100" y="${y}" text-anchor="end" class="muted">${escapeXml(repository.language)}</text>`;
    })
    .join("");

  return `<svg width="1200" height="520" viewBox="0 0 1200 520" fill="none" xmlns="http://www.w3.org/2000/svg" role="img" aria-labelledby="title desc">
  <title id="title">Public code landscape for ${escapeXml(username)}</title>
  <desc id="desc">Language usage across owned public GitHub repositories and recently updated repositories.</desc>
  <defs>
    <linearGradient id="background" x1="70" y1="20" x2="1130" y2="500" gradientUnits="userSpaceOnUse">
      <stop stop-color="#0B1220"/>
      <stop offset="1" stop-color="#111D33"/>
    </linearGradient>
    <linearGradient id="accent" x1="140" y1="0" x2="1060" y2="0" gradientUnits="userSpaceOnUse">
      <stop stop-color="#60A5FA"/>
      <stop offset="1" stop-color="#5EEAD4"/>
    </linearGradient>
    <style>
      .eyebrow { fill: #60A5FA; font: 700 15px Arial, sans-serif; letter-spacing: 3px; }
      .heading { fill: #F8FAFC; font: 700 32px Arial, sans-serif; }
      .stat { fill: #F8FAFC; font: 700 28px Arial, sans-serif; }
      .stat-label { fill: #94A3B8; font: 14px Arial, sans-serif; }
      .section { fill: #CBD5E1; font: 700 15px Arial, sans-serif; letter-spacing: 1px; }
      .label, .repo { fill: #E2E8F0; font: 15px Arial, sans-serif; }
      .value { fill: #94A3B8; font: 600 14px Arial, sans-serif; }
      .muted { fill: #64748B; font: 13px Arial, sans-serif; }
    </style>
    <clipPath id="language-bar"><rect x="140" y="203" width="920" height="18" rx="9"/></clipPath>
  </defs>

  <rect width="1200" height="520" rx="24" fill="url(#background)"/>
  <rect x="1" y="1" width="1198" height="518" rx="23" stroke="#334155" stroke-opacity="0.7"/>
  <rect x="76" y="64" width="8" height="94" rx="4" fill="url(#accent)"/>

  <text x="110" y="84" class="eyebrow">PUBLIC CODE LANDSCAPE</text>
  <text x="108" y="126" class="heading">What I have built with</text>
  <text x="108" y="154" class="muted">Owned public repositories · forks and archived projects excluded · updated ${updatedAt}</text>

  <g transform="translate(720 76)">
    <text x="0" y="25" class="stat">${repositories.length}</text>
    <text x="0" y="50" class="stat-label">repositories</text>
    <text x="150" y="25" class="stat">${languages.length}</text>
    <text x="150" y="50" class="stat-label">languages</text>
    <text x="300" y="25" class="stat">${formatBytes(totalBytes)}</text>
    <text x="300" y="50" class="stat-label">${approximate ? "repository data" : "code indexed"}</text>
  </g>

  <g clip-path="url(#language-bar)">
    ${segments}
  </g>

  <text x="140" y="256" class="section">LANGUAGE MIX</text>
  <text x="860" y="256" class="section">RECENTLY UPDATED</text>
  ${languageRows}
  ${repositoryRows}

  <line x1="820" y1="246" x2="820" y2="448" stroke="#334155"/>
  <text x="140" y="482" class="muted">${approximate ? "Initial snapshot based on primary language and repository size" : "Based on GitHub Linguist language-byte statistics"}</text>
  <text x="1060" y="482" text-anchor="end" class="muted">github.com/${escapeXml(username)}</text>
</svg>
`;
}

async function main() {
  let repositories;
  let languages;
  let approximate = false;
  const fixturePath = process.argv[2];

  if (fixturePath) {
    approximate = true;
    repositories = JSON.parse(await readFile(fixturePath, "utf8")).filter(
      (repository) =>
        !repository.fork &&
        !repository.archived &&
        repository.name !== username,
    );
    const totals = new Map();

    for (const repository of repositories) {
      if (!repository.language) continue;
      totals.set(
        repository.language,
        (totals.get(repository.language) || 0) + Math.max(repository.size, 1) * 1000,
      );
    }

    languages = [...totals.entries()]
      .map(([name, bytes]) => ({ name, bytes }))
      .sort((left, right) => right.bytes - left.bytes);
  } else {
    repositories = await fetchRepositories();
    languages = await fetchLanguageTotals(repositories);
  }

  if (!languages.length) throw new Error("No language data was found.");

  await writeFile(
    "assets/code-stats.svg",
    renderSvg(repositories, languages, approximate),
  );
  console.log(
    `Generated assets/code-stats.svg from ${repositories.length} repositories and ${languages.length} languages.`,
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
