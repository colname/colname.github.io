export function parseRosterText(value) {
  return parseRosterEntries(value).map(entry => entry.name);
}

export function parseRosterEntries(value) {
  const lines = rosterLines(value);
  if (lines.length === 0) return [];

  const numbered = lines
    .map(parseNumberedEntry)
    .filter(Boolean);

  // 接龙通常包含标题或说明文字；只要识别到编号行，就只采用编号后的队员。
  if (numbered.length > 0) return numbered;

  return lines
    .flatMap(line => line.split(/[\s，,、；;|\t]+/))
    .map(parseRosterEntry)
    .filter(entry => entry.name);
}

export function formatRosterEntry(entry) {
  return entry.level ? `【${entry.level}】${entry.name}` : entry.name;
}

export function parseGroupedRosterText(value) {
  const lines = rosterLines(value);
  const result = {
    males: [],
    females: [],
    unknown: [],
    maleEntries: [],
    femaleEntries: [],
    unknownEntries: [],
    groups: {}
  };
  let currentGroup = "";

  lines.forEach(line => {
    const group = detectGroupHeading(line);
    if (group) currentGroup = group;

    const entry = parseNumberedEntry(line);
    if (!entry) return;

    const gender = detectGender(line, currentGroup);
    if (gender === "male") {
      result.males.push(entry.name);
      result.maleEntries.push(entry);
    } else if (gender === "female") {
      result.females.push(entry.name);
      result.femaleEntries.push(entry);
    } else {
      result.unknown.push(entry.name);
      result.unknownEntries.push(entry);
    }

    if (currentGroup) {
      result.groups[currentGroup] = (result.groups[currentGroup] || 0) + 1;
    }
  });

  return result;
}

function rosterLines(value) {
  return String(value ?? "")
    .replaceAll("\r", "")
    .split("\n")
    .map(line => line.trim())
    .filter(Boolean);
}

function parseNumberedEntry(line) {
  const match = line.match(
    /^\s*(?:\d{1,3}\s*(?:[、,，:：)）-]|[.．](?!\d)|\s)\s*|[（(]\d{1,3}[)）]\s*)(.+?)\s*$/,
  );
  return match ? parseRosterEntry(match[1]) : null;
}

function parseRosterEntry(value) {
  const raw = String(value ?? "").trim();
  const levelMatch = raw.match(/^[【\[]\s*(\d+(?:\.\d+)?)\s*[】\]]\s*/);
  const name = raw
    .replace(/^[【\[]\s*\d+(?:\.\d+)?\s*[】\]]\s*/, "")
    .replace(/[🌿🎀♂♀️]/gu, "")
    .replace(/[，,、；;]+$/, "")
    .trim();
  return {
    name,
    level: levelMatch?.[1] || ""
  };
}

function detectGroupHeading(line) {
  if (/^男双(?:\s|[（(]|$)/.test(line)) return "男双";
  if (/^女双(?:\s|[（(]|$)/.test(line)) return "女双";
  if (/^混双(?:\s|[（(]|$)/.test(line)) return "混双";
  if (/^单打(?:\s|[（(]|$)/.test(line)) return "单打";
  return "";
}

function detectGender(line, group) {
  if (line.includes("🌿") || /♂️?/.test(line)) return "male";
  if (line.includes("🎀") || /♀️?/.test(line)) return "female";
  if (group === "男双") return "male";
  if (group === "女双") return "female";
  return "unknown";
}
