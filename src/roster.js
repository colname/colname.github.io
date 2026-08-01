export function parseRosterText(value) {
  const lines = String(value ?? "")
    .replaceAll("\r", "")
    .split("\n")
    .map(line => line.trim())
    .filter(Boolean);

  if (lines.length === 0) return [];

  const numbered = lines
    .map(parseNumberedLine)
    .filter(Boolean);

  // 接龙通常包含标题或说明文字；只要识别到编号行，就只采用编号后的姓名。
  if (numbered.length > 0) return numbered;

  return lines
    .flatMap(line => line.split(/[\s，,、；;|\t]+/))
    .map(cleanRosterName)
    .filter(Boolean);
}

export function parseGroupedRosterText(value) {
  const lines = String(value ?? "")
    .replaceAll("\r", "")
    .split("\n")
    .map(line => line.trim())
    .filter(Boolean);

  const result = {
    males: [],
    females: [],
    unknown: [],
    groups: {}
  };
  let currentGroup = "";

  lines.forEach(line => {
    const group = detectGroupHeading(line);
    if (group) currentGroup = group;

    const numberedName = parseNumberedLine(line);
    if (!numberedName) return;

    const gender = detectGender(line, currentGroup);
    if (gender === "male") result.males.push(numberedName);
    else if (gender === "female") result.females.push(numberedName);
    else result.unknown.push(numberedName);

    if (currentGroup) {
      result.groups[currentGroup] = (result.groups[currentGroup] || 0) + 1;
    }
  });

  return result;
}

function parseNumberedLine(line) {
  const match = line.match(
    /^\s*(?:\d{1,3}\s*(?:[、,，:：)）-]|[.．](?!\d)|\s)\s*|[（(]\d{1,3}[)）]\s*)(.+?)\s*$/,
  );
  return match ? cleanRosterName(match[1]) : "";
}

function cleanRosterName(value) {
  return value
    .trim()
    .replace(/^[【\[]\s*\d+(?:\.\d+)?\s*[】\]]\s*/, "")
    .replace(/[🌿🎀♂♀️]/gu, "")
    .replace(/[，,、；;]+$/, "")
    .trim();
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
