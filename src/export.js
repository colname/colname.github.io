import { calculateRanking } from "./ranking.js?v=9";
import { formatDuration, matchTypeLabel, teamName } from "./model.js?v=16";

export function buildCSV(session) {
  const rows = [["场次", "类型", "对阵", "比分", "用时", "状态"]];
  session.matches.forEach(match => {
    rows.push([
      match.order,
      matchTypeLabel(match.type),
      `${teamName(session, match.teams[0])} vs ${teamName(session, match.teams[1])}`,
      match.scoreRecorded === false ? "未录入" : `${match.score.a}:${match.score.b}`,
      formatDuration(match.elapsedSeconds),
      match.status === "completed" ? "已完成" : "未完成"
    ]);
  });
  const { ranking, validMatches } = calculateRanking(session);
  rows.push([], ["个人排名"], ["排名", "队员", "等级", "场次", "胜", "负", "净胜分"]);
  ranking.forEach(player => rows.push([
    validMatches ? player.rank : "",
    player.name,
    player.level,
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
  const rankingRowHeight = 78;
  const matchCardHeight = 198;
  const rankingCardHeight = 28 + ranking.length * rankingRowHeight;
  const height = 270 + rankingCardHeight + 92 + session.matches.length * matchCardHeight + 70;
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
  ctx.font = '800 52px -apple-system,"PingFang SC",sans-serif';
  ctx.fillText(`🏸 ${session.name}`, 58, 76);
  const done = session.matches.filter(match => match.status === "completed").length;
  ctx.fillStyle = "#94a3b8";
  ctx.font = '500 25px -apple-system,"PingFang SC",sans-serif';
  ctx.fillText(`已完成 ${done}/${session.matches.length} 场 · ${validMatches} 场计入排名`, 58, 124);
  ctx.textAlign = "right";
  ctx.fillText(new Date().toLocaleString("zh-CN", { hour12: false }), width - 58, 124);
  ctx.textAlign = "left";

  let y = 174;
  ctx.fillStyle = "#f8fafc";
  ctx.font = '800 34px -apple-system,"PingFang SC",sans-serif';
  ctx.fillText("个人排名", 58, y);
  y += 30;
  roundedRect(ctx, 42, y, width - 84, rankingCardHeight, 24, "#0d1b2d");
  ranking.forEach((player, index) => {
    const rowTop = y + 14 + index * rankingRowHeight;
    const isFirst = player.rank === 1 && validMatches > 0;
    roundedRect(ctx, 58, rowTop, width - 116, rankingRowHeight - 8, 14,
      isFirst ? "#17334c" : index % 2 ? "#0d1b2d" : "#12243a");
    ctx.beginPath();
    ctx.arc(94, rowTop + 35, 23, 0, Math.PI * 2);
    ctx.fillStyle = isFirst ? "#b9f52d" : "#25415c";
    ctx.fill();
    ctx.fillStyle = isFirst ? "#07111f" : "#f8fafc";
    ctx.font = '800 25px -apple-system,"PingFang SC",sans-serif';
    ctx.textAlign = "center";
    ctx.fillText(validMatches ? String(player.rank) : "—", 94, rowTop + 44);
    ctx.textAlign = "left";
    ctx.fillStyle = isFirst ? "#d9ff70" : "#f8fafc";
    ctx.font = '750 29px -apple-system,"PingFang SC",sans-serif';
    ctx.fillText(fitText(ctx, player.name, player.level ? 360 : 490), 142, rowTop + 45);
    if (player.level) {
      roundedRect(ctx, 525, rowTop + 17, 118, 38, 18, isFirst ? "#d9ff70" : "#fbbf24");
      ctx.fillStyle = "#07111f";
      ctx.font = '850 20px -apple-system,"PingFang SC",sans-serif';
      ctx.textAlign = "center";
      ctx.fillText(`${player.level}级`, 584, rowTop + 43);
      ctx.textAlign = "left";
    }
    ctx.fillStyle = "#f8fafc";
    ctx.font = '700 27px -apple-system,"PingFang SC",sans-serif';
    ctx.fillText(`${player.wins}胜${player.losses}负`, 730, rowTop + 44);
    ctx.fillStyle = player.net > 0 ? "#86efac" : player.net < 0 ? "#fda4af" : "#cbd5e1";
    ctx.fillText(`净胜分 ${player.net > 0 ? "+" : ""}${player.net}`, 940, rowTop + 44);
  });

  y += rankingCardHeight + 62;
  ctx.fillStyle = "#f8fafc";
  ctx.font = '800 34px -apple-system,"PingFang SC",sans-serif';
  ctx.fillText("全部赛果", 58, y);
  y += 28;
  session.matches.forEach((match, index) => {
    const cardY = y + index * matchCardHeight;
    roundedRect(ctx, 42, cardY, width - 84, matchCardHeight - 14, 22,
      index % 2 ? "#0d1b2d" : "#102138");
    roundedRect(ctx, 505, cardY + 15, 232, 37, 18, "#1a3855");
    ctx.fillStyle = "#dbeafe";
    ctx.font = '750 21px -apple-system,"PingFang SC",sans-serif';
    ctx.textAlign = "center";
    ctx.fillText(`第${match.order}场 · ${matchTypeLabel(match.type)}`, width / 2, cardY + 41);
    ctx.fillStyle = "#f8fafc";
    ctx.font = '700 25px -apple-system,"PingFang SC",sans-serif';
    ctx.fillText(fitText(ctx, teamName(session, match.teams[0]), 450), 310, cardY + 83);
    ctx.fillText(fitText(ctx, teamName(session, match.teams[1]), 450), 932, cardY + 83);

    const recorded = match.scoreRecorded !== false;
    if (recorded) {
      const scoreA = Number(match.score.a);
      const scoreB = Number(match.score.b);
      const leftWon = match.status === "completed" && scoreA > scoreB;
      const rightWon = match.status === "completed" && scoreB > scoreA;
      ctx.font = '900 88px -apple-system,"PingFang SC",sans-serif';
      ctx.textAlign = "right";
      ctx.fillStyle = leftWon ? "#b9f52d" : "#f8fafc";
      ctx.fillText(String(scoreA), 565, cardY + 170);
      ctx.textAlign = "center";
      ctx.fillStyle = "#64748b";
      ctx.fillText(":", width / 2, cardY + 166);
      ctx.textAlign = "left";
      ctx.fillStyle = rightWon ? "#b9f52d" : "#f8fafc";
      ctx.fillText(String(scoreB), 677, cardY + 170);
    } else {
      ctx.fillStyle = "#94a3b8";
      ctx.font = '750 31px -apple-system,"PingFang SC",sans-serif';
      ctx.textAlign = "center";
      ctx.fillText("未录入比分", width / 2, cardY + 151);
    }
    ctx.textAlign = "right";
    ctx.fillStyle = match.status === "completed" ? "#86efac" : "#94a3b8";
    ctx.font = '650 20px -apple-system,"PingFang SC",sans-serif';
    ctx.fillText(match.status === "completed" ? "已结束" : "未结束", width - 68, cardY + 40);
    ctx.textAlign = "left";
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
