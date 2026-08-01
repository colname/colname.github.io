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

function levelColor(level) {
  const value = Number(level);
  if (value >= 4.5) return "#e879f9";
  if (value >= 3.5) return "#fbbf24";
  if (value >= 2.5) return "#4ade80";
  return "#38bdf8";
}

function drawSchedulePlayer(ctx, player, centerX, baselineY, maxWidth) {
  const level = String(player?.level || "");
  ctx.font = '750 29px -apple-system,"PingFang SC",sans-serif';
  const badgeWidth = level ? 72 : 0;
  const badgeGap = level ? 10 : 0;
  const name = fitText(ctx, player?.name || "未知队员", maxWidth - badgeWidth - badgeGap);
  const nameWidth = ctx.measureText(name).width;
  const totalWidth = nameWidth + badgeGap + badgeWidth;
  const startX = centerX - totalWidth / 2;

  ctx.fillStyle = "#f8fafc";
  ctx.textAlign = "left";
  ctx.fillText(name, startX, baselineY);
  if (!level) return;

  const badgeX = startX + nameWidth + badgeGap;
  roundedRect(ctx, badgeX, baselineY - 27, badgeWidth, 32, 11, levelColor(level));
  ctx.fillStyle = "#06111e";
  ctx.font = '900 18px -apple-system,"PingFang SC",sans-serif';
  ctx.textAlign = "center";
  ctx.fillText(level, badgeX + badgeWidth / 2, baselineY - 5);
}

function drawScheduleTeam(ctx, players, centerX, centerY) {
  const lineGap = 43;
  const firstY = centerY - (players.length - 1) * lineGap / 2;
  players.forEach((player, index) => {
    drawSchedulePlayer(ctx, player, centerX, firstY + index * lineGap, 405);
  });
}

export function createScheduleCanvas(session) {
  const width = 1242;
  const matchCardHeight = 176;
  const headerHeight = 254;
  const footerHeight = 96;
  const height = headerHeight + session.matches.length * matchCardHeight + footerHeight;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  const gradient = ctx.createLinearGradient(0, 0, width, height);
  gradient.addColorStop(0, "#06111f");
  gradient.addColorStop(.52, "#0a1d30");
  gradient.addColorStop(1, "#071523");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);

  ctx.fillStyle = "#7dd3fc";
  ctx.font = '850 23px -apple-system,"PingFang SC",sans-serif';
  ctx.fillText("YJUN BADMINTON · 赛程分享", 58, 48);
  ctx.fillStyle = "#f8fafc";
  ctx.font = '900 52px -apple-system,"PingFang SC",sans-serif';
  ctx.fillText(fitText(ctx, session.name || "羽毛球活动", width - 116), 58, 112);

  const singles = session.scheduleConfig?.mode === "singles" ||
    session.scheduleConfig?.allowedTypes?.includes("singles");
  const facts = [singles ? "单打轮转" : "双打轮转", `${session.players.length}人`, `${session.matches.length}场`];
  let factX = 58;
  facts.forEach((fact, index) => {
    ctx.font = '800 21px -apple-system,"PingFang SC",sans-serif';
    const factWidth = ctx.measureText(fact).width + 34;
    roundedRect(ctx, factX, 145, factWidth, 42, 20, index === 0 ? "#0e7490" : "#17344e");
    ctx.fillStyle = "#e0f2fe";
    ctx.textAlign = "center";
    ctx.fillText(fact, factX + factWidth / 2, 173);
    factX += factWidth + 12;
  });
  ctx.textAlign = "left";
  ctx.fillStyle = "#94a3b8";
  ctx.font = '500 21px -apple-system,"PingFang SC",sans-serif';
  ctx.fillText("按场次顺序进行比赛 · 等级颜色与网页一致", 58, 222);

  const players = new Map(session.players.map(player => [player.id, player]));
  session.matches.forEach((match, index) => {
    const cardY = headerHeight + index * matchCardHeight;
    roundedRect(ctx, 42, cardY + 8, width - 84, matchCardHeight - 16, 22,
      index % 2 ? "#0d1b2d" : "#11243a");
    roundedRect(ctx, 62, cardY + 28, 104, 38, 17, "#075985");
    ctx.fillStyle = "#e0f2fe";
    ctx.font = '850 20px -apple-system,"PingFang SC",sans-serif';
    ctx.textAlign = "center";
    ctx.fillText(`第${match.order}场`, 114, cardY + 54);

    const type = matchTypeLabel(match.type);
    ctx.font = '750 19px -apple-system,"PingFang SC",sans-serif';
    const typeWidth = Math.max(92, ctx.measureText(type).width + 30);
    roundedRect(ctx, width - 62 - typeWidth, cardY + 28, typeWidth, 38, 18, "#17344e");
    ctx.fillStyle = "#bae6fd";
    ctx.fillText(type, width - 62 - typeWidth / 2, cardY + 54);

    ctx.fillStyle = "#64748b";
    ctx.font = '950 23px -apple-system,"PingFang SC",sans-serif';
    ctx.fillText("VS", width / 2, cardY + 108);
    drawScheduleTeam(ctx, match.teams[0].map(id => players.get(id)), 348, cardY + 112);
    drawScheduleTeam(ctx, match.teams[1].map(id => players.get(id)), 894, cardY + 112);
  });

  const footerY = height - footerHeight;
  ctx.fillStyle = "#64748b";
  ctx.font = '550 20px -apple-system,"PingFang SC",sans-serif';
  ctx.textAlign = "left";
  ctx.fillText("生成于 colname.github.io", 58, footerY + 54);
  ctx.textAlign = "right";
  ctx.fillText(new Date().toLocaleString("zh-CN", { hour12: false }), width - 58, footerY + 54);
  ctx.textAlign = "left";
  return canvas;
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
  return shareCanvas(createResultCanvas(session), {
    fileName: `${session.name}-比赛记录.png`,
    title: session.name,
    text: "比赛结果与个人排名"
  });
}

export async function shareScheduleImage(session) {
  return shareCanvas(createScheduleCanvas(session), {
    fileName: `${session.name}-赛程.png`,
    title: `${session.name} · 赛程`,
    text: "羽毛球比赛赛程"
  });
}

async function shareCanvas(canvas, { fileName, title, text }) {
  const blob = await new Promise(resolve => canvas.toBlob(resolve, "image/png", 1));
  if (!blob) throw new Error("图片生成失败");
  const file = new File([blob], fileName, { type: "image/png" });
  if (navigator.share && navigator.canShare?.({ files: [file] })) {
    await navigator.share({ title, text, files: [file] });
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
