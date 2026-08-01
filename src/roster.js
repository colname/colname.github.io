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

function parseNumberedLine(line) {
  const match = line.match(
    /^\s*(?:\d{1,3}\s*(?:[、.．,，:：)）-]|\s)\s*|[（(]\d{1,3}[)）]\s*)(.+?)\s*$/,
  );
  return match ? cleanRosterName(match[1]) : "";
}

function cleanRosterName(value) {
  return value.trim().replace(/[，,、；;]+$/, "").trim();
}
