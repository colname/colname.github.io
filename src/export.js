import { calculateRanking } from "./ranking.js?v=7";
import { formatDuration, matchTypeLabel, teamName } from "./model.js?v=7";

export function buildCSV(session) {
  const rows = [["场次", "类型", "对阵", "比分", "用时", "状态"]];
  session.matches.forEach(match => {
    rows.push([
      match.order,
      matchTypeLabel(match.type),
      `${teamName(session, match.teams[0])} vs ${teamName(session, match.teams[1])}`,
      `${match.score.a}:${match.score.b}`,
      formatDuration(match.elapsedSeconds),
      match.status === "completed" ? "已完成" : "未完成"
    ]);
  });
  const { ranking, validMatches } = calculateRanking(session);
  rows.push([], ["个人排名"], ["排名", "队员", "场次", "胜", "负", "净胜分"]);
  ranking.forEach(player => rows.push([
    validMatches ? player.rank : "",
    player.name,
    player.played,
    player.wins,
    player.losses,
    player.net
  ]));
  return "\uFEFF" + rows
    .map(row => row.map(value => `"${String(value ?? "").replaceAll('"', '""')}"`).join(","))
    .join("\n");
}

export async function copySessionCSV(session) {
  const csv = buildCSV(session);
  try {
    await navigator.clipboard.writeText(csv);
    return true;
  } catch {
    const area = document.createElement("textarea");
    area.value = csv;
    area.style.position = "fixed";
    area.style.opacity = "0";
    document.body.appendChild(area);
    area.select();
    const copied = document.execCommand("copy");
    area.remove();
    return copied;
  }
}

function roundedRect(ctx, x, y, width, height, radius, fill) {
  ctx.beginPath();
  ctx.roundRect(x, y, width, height, radius);
  ctx.fillStyle = fill;
  ctx.fill();
}

function fitText(ctx, text, maxWidth) {
  const value = String(text);
  if (ctx.measureText(value).width <= maxWidth) return value;
  let result = value;
  while (result.length > 2 && ctx.measureText(`${result}…`).width > maxWidth) result = result.slice(0, -1);
  return `${result}…`;
}

export function createResultCanvas(session) {
  const { ranking, validMatches } = calculateRanking(session);
  const width = 1242;
  const rowHeight = 66;
  const height = 280 + ranking.length * rowHeight + 105 + session.matches.length * rowHeight + 90;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  const gradient = ctx.createLinearGradient(0, 0, 0, height);
  gradient.addColorStop(0, "#07111f");
  gradient.addColorStop(1, "#0a1829");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = "#f8fafc";
  ctx.font = '800 48px -apple-system,"PingFang SC",sans-serif';
  ctx.fillText(`🏸 ${session.name}`, 58, 72);
  const done = session.matches.filter(match => match.status === "completed").length;
  ctx.fillStyle = "#94a3b8";
  ctx.font = '500 25px -apple-system,"PingFang SC",sans-serif';
  ctx.fillText(`已完成 ${done}/${session.matches.length} 场 · ${validMatches} 场有效结果`, 58, 120);
  ctx.textAlign = "right";
  ctx.fillText(new Date().toLocaleString("zh-CN", { hour12: false }), width - 58, 120);
  ctx.textAlign = "left";

  let y = 160;
  roundedRect(ctx, 42, y, width - 84, 74 + ranking.length * rowHeight, 24, "#0d1b2d");
  ctx.fillStyle = "#bae6fd";
  ctx.font = '750 25px -apple-system,"PingFang SC",sans-serif';
  ctx.fillText("名次", 72, y + 45);
  ctx.fillText("队员", 190, y + 45);
  ctx.fillText("场次", 650, y + 45);
  ctx.fillText("胜", 800, y + 45);
  ctx.fillText("负", 930, y + 45);
  ctx.fillText("净胜分", 1050, y + 45);
  ranking.forEach((player, index) => {
    const rowY = y + 78 + index * rowHeight;
    ctx.fillStyle = index % 2 ? "#0d1b2d" : "#12243a";
    ctx.fillRect(58, rowY - 31, width - 116, rowHeight);
    ctx.fillStyle = "#f8fafc";
    ctx.font = '650 26px -apple-system,"PingFang SC",sans-serif';
    ctx.fillText(validMatches ? String(player.rank) : "—", 78, rowY + 8);
    ctx.fillText(fitText(ctx, player.name, 370), 190, rowY + 8);
    ctx.fillText(String(player.played), 675, rowY + 8);
    ctx.fillText(String(player.wins), 810, rowY + 8);
    ctx.fillText(String(player.losses), 940, rowY + 8);
    ctx.fillText(player.net > 0 ? `+${player.net}` : String(player.net), 1080, rowY + 8);
  });

  y += 100 + ranking.length * rowHeight;
  ctx.fillStyle = "#f8fafc";
  ctx.font = '800 34px -apple-system,"PingFang SC",sans-serif';
  ctx.fillText("全部赛果", 58, y);
  y += 44;
  roundedRect(ctx, 42, y, width - 84, 58 + session.matches.length * rowHeight, 24, "#0d1b2d");
  session.matches.forEach((match, index) => {
    const rowY = y + 48 + index * rowHeight;
    if (index % 2 === 0) {
      ctx.fillStyle = "#12243a";
      ctx.fillRect(58, rowY - 29, width - 116, rowHeight);
    }
    ctx.fillStyle = "#f8fafc";
    ctx.font = '600 23px -apple-system,"PingFang SC",sans-serif';
    ctx.fillText(`${match.order}. ${matchTypeLabel(match.type)}`, 76, rowY + 8);
    const versus = `${teamName(session, match.teams[0])}  vs  ${teamName(session, match.teams[1])}`;
    ctx.fillText(fitText(ctx, versus, 650), 245, rowY + 8);
    ctx.fillText(`${match.score.a} : ${match.score.b}`, 945, rowY + 8);
    ctx.fillStyle = match.status === "completed" ? "#86efac" : "#94a3b8";
    ctx.fillText(match.status === "completed" ? "已完成" : "未完成", 1080, rowY + 8);
  });
  return canvas;
}

export async function shareResultImage(session) {
  const canvas = createResultCanvas(session);
  const blob = await new Promise(resolve => canvas.toBlob(resolve, "image/png", 1));
  if (!blob) throw new Error("图片生成失败");
  const file = new File([blob], `${session.name}-比赛记录.png`, { type: "image/png" });
  if (navigator.share && navigator.canShare?.({ files: [file] })) {
    await navigator.share({ title: session.name, text: "比赛结果与个人排名", files: [file] });
    return "shared";
  }
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = file.name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 3000);
  return "downloaded";
}
