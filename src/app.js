import { createPlayers, createSession, createSinglesPlayers, formatDuration, matchTypeLabel, playerMap, teamName } from "./model.js?v=15";
import { generateSchedule, generateSinglesSchedule, MATCH_TYPE_LABELS, parseNames } from "./scheduler.js?v=16";
import { activeSession, loadStore, removeSession, saveStore, setActiveSession, upsertSession } from "./storage.js?v=8";
import { calculateRanking } from "./ranking.js?v=8";
import { copySessionCSV, shareResultImage } from "./export.js?v=15";
import {
  buildLiveUrl,
  closeLiveRoom,
  createLiveRoom,
  getLiveRoom,
  primarySiteUrl,
  realtimeConfigured,
  roomIdFromUrl,
  updateLiveRoom,
  watchLiveRoom
} from "./realtime.js?v=12";

const $ = id => document.getElementById(id);
const store = loadStore();
let preview = null;
let toastTimer = null;
let wakeLock = null;
let touchStartX = null;
let setupMode = "doubles";
let liveSyncTimer = null;
let liveRoomData = null;
let liveWatcher = null;
let livePollTimer = null;
const requestedLiveRoomId = roomIdFromUrl();

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function showToast(message) {
  clearTimeout(toastTimer);
  $("toast").textContent = message;
  $("toast").classList.add("show");
  toastTimer = setTimeout(() => $("toast").classList.remove("show"), 1800);
}

const rosterFields = [
  { inputId: "malePlayers", countId: "malePlayerCount" },
  { inputId: "femalePlayers", countId: "femalePlayerCount" },
  { inputId: "singlesPlayers", countId: "singlesPlayerCount", target: 4 }
];

function updateRosterCount({ inputId, countId, target }) {
  const count = parseNames($(inputId).value).length;
  $(countId).textContent = target
    ? `已识别 ${count} / ${target} 人`
    : `已识别 ${count} 人`;
  return count;
}

async function pasteRosterFromClipboard(targetId) {
  const field = rosterFields.find(item => item.inputId === targetId);
  try {
    const value = await navigator.clipboard.readText();
    if (!value.trim()) throw new Error("剪贴板是空的");
    $(targetId).value = value;
    const count = updateRosterCount(field);
    showToast(`已从接龙识别 ${count} 人`);
  } catch (error) {
    $(targetId).focus();
    showToast(error?.message === "剪贴板是空的"
      ? error.message
      : "无法读取剪贴板，请长按输入框粘贴");
  }
}

function vibrate(pattern = 15) {
  navigator.vibrate?.(pattern);
}

function currentSession() {
  return activeSession(store);
}

function currentMatch(session = currentSession()) {
  if (!session) return null;
  return session.matches.find(match => match.id === session.runtime.currentMatchId) || session.matches[0] || null;
}

function queueLiveSync(session, delay = 350) {
  if (!session?.liveShare?.active || !session.liveShare.roomId) return;
  clearTimeout(liveSyncTimer);
  liveSyncTimer = setTimeout(async () => {
    try {
      await updateLiveRoom(session.liveShare.roomId, session);
      session.liveShare.lastSyncedAt = new Date().toISOString();
      session.liveShare.syncError = null;
    } catch (error) {
      session.liveShare.syncError = error?.message || "同步失败";
    }
    upsertSession(store, session);
    renderLiveShare(session);
  }, delay);
}

function persistSession(session, makeActive = true) {
  upsertSession(store, session, makeActive);
  queueLiveSync(session);
}

function displayedElapsed(session, match) {
  let seconds = Number(match.elapsedSeconds || 0);
  if (session.runtime.runningMatchId === match.id && session.runtime.startedAt) {
    seconds += (Date.now() - session.runtime.startedAt) / 1000;
  }
  return seconds;
}

function commitRunningTime(session) {
  if (!session?.runtime.runningMatchId || !session.runtime.startedAt) return;
  const match = session.matches.find(item => item.id === session.runtime.runningMatchId);
  if (match) match.elapsedSeconds += (Date.now() - session.runtime.startedAt) / 1000;
  session.runtime.startedAt = Date.now();
}

async function requestWakeLock() {
  try {
    if ("wakeLock" in navigator) wakeLock = await navigator.wakeLock.request("screen");
  } catch {
    wakeLock = null;
  }
}

function releaseWakeLock() {
  try {
    wakeLock?.release();
  } catch {
    // The platform can release the lock before us.
  }
  wakeLock = null;
}

function pauseTimer(session = currentSession(), persist = true) {
  if (!session?.runtime.runningMatchId) return;
  commitRunningTime(session);
  session.runtime.runningMatchId = null;
  session.runtime.startedAt = null;
  releaseWakeLock();
  if (persist) persistSession(session);
}

function switchView(viewName) {
  document.querySelectorAll(".view").forEach(view => view.classList.remove("active"));
  document.querySelectorAll(".bottom-tabs button").forEach(button => button.classList.toggle("active", button.dataset.view === viewName));
  $(`${viewName}View`).classList.add("active");
  renderAll();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function switchSetupMode(mode) {
  setupMode = mode;
  preview = null;
  $("doublesModeBtn").classList.toggle("active", mode === "doubles");
  $("singlesModeBtn").classList.toggle("active", mode === "singles");
  $("doublesScheduleForm").classList.toggle("hidden", mode !== "doubles");
  $("singlesScheduleForm").classList.toggle("hidden", mode !== "singles");
  $("setupTitle").textContent = mode === "doubles" ? "生成双打赛程" : "生成单打轮转";
  $("setupDescription").textContent = mode === "doubles"
    ? "支持6–8人任意男女比例；先保证场次公平，再优化搭档、对手和连续出场。"
    : "4人单循环，每两人交手一次，每人3场，并减少连续出场。";
  renderPreview();
}

function buildMetric(label, value) {
  const card = element("div", "metric");
  card.append(element("strong", "", value), element("span", "", label));
  return card;
}

function renderPreview() {
  const root = $("schedulePreview");
  root.replaceChildren();
  if (!preview) {
    root.classList.add("hidden");
    return;
  }
  root.classList.remove("hidden");

  const panel = element("section", "panel");
  const heading = element("div", "preview-head");
  const title = element("h2", "", "赛程预览");
  const valid = element("span", "success-line", "✓ 公平性校验通过");
  heading.append(title, valid);
  panel.append(heading);

  const summary = element("div", "summary-grid");
  const singles = preview.result.plan.mode === "singles";
  summary.append(
    buildMetric("比赛场数", `${preview.result.plan.matchCount} 场`),
    buildMetric("每人场数", `${preview.result.plan.targetAppearances} 场`),
    singles
      ? buildMetric("每组交手", `${preview.result.quality.opponentMax} 次`)
      : buildMetric("最多搭档次数", `${preview.result.quality.partnerMax} 次`),
    buildMetric("最长连续出场", `${preview.result.quality.maxStreak} 场`)
  );
  panel.append(summary);

  const quotaText = Object.entries(preview.result.plan.typeQuotas)
    .filter(([, count]) => count > 0)
    .map(([type, count]) => `${MATCH_TYPE_LABELS[type]} ${count} 场`)
    .join("＋");
  const hasCrossTypeMatch = preview.result.plan.allowedTypes.some(type =>
    type === "mixedMens" || type === "mixedWomens"
  );
  panel.append(element("p", "note", singles
    ? `轮转规则：${quotaText}，每两人交手一次。`
    : `比赛配额：${quotaText}${hasCrossTypeMatch ? "；跨类型对阵可现场自行约定让分" : ""}；随机种子：${preview.result.seed}`));

  preview.result.matches.forEach(match => {
    const row = element("div", "preview-match");
    row.append(element("span", "round-number", `第${match.order}场`));
    row.append(element("span", "match-line",
      `${teamName({ players: preview.players }, match.teams[0])} vs ${teamName({ players: preview.players }, match.teams[1])}`));
    row.append(element("span", "type-pill", matchTypeLabel(match.type)));
    panel.append(row);
  });

  const confirm = element("button", "primary-btn", "确认赛程并开始计分");
  confirm.type = "button";
  confirm.addEventListener("click", () => {
    const session = createSession({
      name: preview.name,
      players: preview.players,
      scheduleResult: preview.result
    });
    persistSession(session);
    preview = null;
    renderPreview();
    showToast("活动已保存，可以开始计分");
    switchView("score");
  });
  panel.append(confirm);
  root.append(panel);
}

function renderScore() {
  const session = currentSession();
  $("scoreEmpty").classList.toggle("hidden", Boolean(session));
  $("scoreContent").classList.toggle("hidden", !session);
  if (!session) return;
  const match = currentMatch(session);
  if (!match) return;
  const playerNames = playerMap(session);
  const done = session.matches.filter(item => item.status === "completed").length;
  $("progressText").textContent = `第 ${match.order} / ${session.matches.length} 场`;
  $("doneText").textContent = `已完成 ${done} 场`;
  $("progressBar").style.width = `${done / session.matches.length * 100}%`;
  $("roundBadge").textContent = `第 ${match.order} 场`;
  $("typeText").textContent = matchTypeLabel(match.type);
  $("leftTeam").textContent = match.teams[0].map(id => playerNames.get(id)?.name).join("＋");
  $("rightTeam").textContent = match.teams[1].map(id => playerNames.get(id)?.name).join("＋");
  const scoreRecorded = match.scoreRecorded !== false;
  $("scoreEntryIntro").classList.toggle("hidden", scoreRecorded);
  $("scoreEntryPanel").classList.toggle("hidden", !scoreRecorded);
  $("scoreA").value = match.score.a;
  $("scoreB").value = match.score.b;
  $("timer").textContent = formatDuration(displayedElapsed(session, match));
  const running = session.runtime.runningMatchId === match.id;
  $("startBtn").classList.toggle("hidden", running);
  $("pauseBtn").classList.toggle("hidden", !running);
  $("finishBtn").textContent = match.status === "completed"
    ? "✓ 本场已完成，前往下一场"
    : "✓ 结束比赛并进入下一场";
  $("prevBtn").disabled = match.order === 1;
  $("nextBtn").disabled = match.order === session.matches.length;
}

function renderLiveShare(session = currentSession()) {
  const active = Boolean(session?.liveShare?.active && session.liveShare.roomId);
  $("liveShareDetails").classList.toggle("hidden", !active);
  $("startLiveBtn").classList.toggle("hidden", active);
  if (!session) {
    $("liveShareStatus").textContent = "请先创建比赛";
    return;
  }
  if (!active) {
    const configured = realtimeConfigured();
    $("liveShareStatus").textContent = configured
      ? "未开启，只保存在你的手机"
      : "实时共享请使用腾讯稳定版";
    $("startLiveBtn").textContent = configured ? "开启共享" : "打开稳定版";
    return;
  }
  const shareUrl = session.liveShare.url || buildLiveUrl(session.liveShare.roomId);
  $("liveRoomCode").textContent = session.liveShare.roomId;
  $("liveShareLink").textContent = shareUrl;
  $("liveShareStatus").textContent = session.liveShare.syncError
    ? `同步暂时中断：${session.liveShare.syncError}`
    : "共享中 · 朋友只能观看";
}

async function startLiveSharing() {
  const session = currentSession();
  if (!session) return;
  if (!realtimeConfigured()) {
    window.location.href = primarySiteUrl();
    return;
  }
  const button = $("startLiveBtn");
  button.disabled = true;
  button.textContent = "正在开启…";
  try {
    const room = await createLiveRoom(session);
    session.liveShare = {
      ...room,
      active: true,
      startedAt: new Date().toISOString(),
      lastSyncedAt: new Date().toISOString(),
      syncError: null
    };
    upsertSession(store, session);
    renderAll();
    showToast("实时共享已开启");
  } catch (error) {
    showToast(error?.message || "开启实时共享失败");
  } finally {
    button.disabled = false;
    button.textContent = "开启共享";
  }
}

async function stopLiveSharing() {
  const session = currentSession();
  if (!session?.liveShare?.active) return;
  if (!confirm("确定结束本次实时共享吗？朋友的观战页面将停止更新。")) return;
  $("stopLiveBtn").disabled = true;
  try {
    await closeLiveRoom(session.liveShare.roomId, session);
    session.liveShare.active = false;
    session.liveShare.stoppedAt = new Date().toISOString();
    upsertSession(store, session);
    renderAll();
    showToast("实时共享已结束");
  } catch (error) {
    showToast(error?.message || "结束共享失败");
  } finally {
    $("stopLiveBtn").disabled = false;
  }
}

async function copyLiveLink() {
  const session = currentSession();
  const url = session?.liveShare?.url;
  if (!url) return;
  try {
    await navigator.clipboard.writeText(url);
    showToast("观战链接已复制");
  } catch {
    showToast("复制失败，请长按链接复制");
  }
}

async function shareLiveLink() {
  const session = currentSession();
  const url = session?.liveShare?.url;
  if (!url) return;
  if (navigator.share) {
    try {
      await navigator.share({
        title: `${session.name} · 实时观战`,
        text: "打开链接即可实时查看比分、赛程和排名：",
        url
      });
      return;
    } catch (error) {
      if (error?.name === "AbortError") return;
    }
  }
  await copyLiveLink();
}

function renderRanking(session) {
  const { ranking, validMatches } = calculateRanking(session);
  $("rankingStatus").textContent = `${validMatches} 场有效结果`;
  const root = $("rankingList");
  root.replaceChildren();
  ranking.forEach(player => {
    const row = element("div", `ranking-row${player.rank === 1 && validMatches ? " top" : ""}`);
    const rank = validMatches
      ? player.rank === 1 ? "🥇" : player.rank === 2 ? "🥈" : player.rank === 3 ? "🥉" : String(player.rank)
      : "—";
    const net = player.net > 0 ? `+${player.net}` : String(player.net);
    row.append(
      element("span", "", rank),
      element("span", "", player.name),
      element("span", "", String(player.wins)),
      element("span", "", String(player.losses)),
      element("span", player.net > 0 ? "positive" : player.net < 0 ? "negative" : "", net)
    );
    root.append(row);
  });
}

function renderQuality(session) {
  const panel = $("qualityPanel");
  panel.replaceChildren(element("h2", "", "排赛质量"));
  const quality = session.scheduleConfig.quality;
  if (!quality) {
    panel.append(element("p", "note", "该活动由旧版迁移，未保存排赛质量指标。"));
    return;
  }
  const list = element("div", "quality-list");
  const singles = session.scheduleConfig.mode === "singles" ||
    session.scheduleConfig.allowedTypes?.includes("singles");
  const items = singles
    ? [
        ["比赛模式", "4人单打单循环"],
        ["每人场次", `${quality.targetAppearances} 场`],
        ["每组交手", `${quality.opponentMax} 次`],
        ["最长连续出场", `${quality.maxStreak} 场`]
      ]
    : [
        ["出场次数差", `${quality.appearanceRange}（必须为0）`],
        ["每人目标场次", `${quality.targetAppearances} 场`],
        ["最多搭档次数", `${quality.partnerMax} 次`],
        ["最多对手次数", `${quality.opponentMax} 次`],
        ["最长连续出场", `${quality.maxStreak} 场`]
      ];
  items.forEach(([label, value]) => {
    const row = element("div");
    row.append(element("span", "", label), element("strong", "", value));
    list.append(row);
  });
  panel.append(list);
}

function buildResultRoundCard(session, match, { interactive = false, current = false } = {}) {
  const recorded = match.scoreRecorded !== false;
  const completed = match.status === "completed";
  const scoreA = Number(match.score?.a ?? 0);
  const scoreB = Number(match.score?.b ?? 0);
  const leftWon = completed && recorded && scoreA > scoreB;
  const rightWon = completed && recorded && scoreB > scoreA;
  const card = element(
    interactive ? "button" : "div",
    `result-round-card${current ? " current" : ""}${completed ? " done" : ""}`
  );
  if (interactive) card.type = "button";

  const header = element("div", "result-round-head");
  const identity = element("div", "result-round-identity");
  identity.append(
    element("strong", "", `第${match.order}场`),
    element("span", "type-pill", matchTypeLabel(match.type))
  );
  header.append(
    identity,
    element("span", `result-status${completed ? " completed" : ""}`, completed ? "已结束" : "未结束")
  );
  card.append(header);

  const matchup = element("div", "result-matchup");
  const left = element("div", `result-side${leftWon ? " winner" : ""}`);
  const right = element("div", `result-side${rightWon ? " winner" : ""}`);
  left.append(element("span", "result-team-name", teamName(session, match.teams[0])));
  right.append(element("span", "result-team-name", teamName(session, match.teams[1])));

  if (recorded) {
    left.append(element("strong", "result-score", String(scoreA)));
    right.append(element("strong", "result-score", String(scoreB)));
  } else {
    left.append(element("span", "result-score-placeholder", "—"));
    right.append(element("span", "result-score-placeholder", "—"));
  }
  matchup.append(left, element("span", "result-colon", recorded ? ":" : "VS"), right);
  card.append(matchup);
  card.append(element(
    "div",
    `result-round-footer${recorded ? "" : " unrecorded"}`,
    `${recorded ? "比分已记录" : "未录入比分"} · ${formatDuration(match.elapsedSeconds)}`
  ));
  return card;
}

function renderRoundList(session) {
  const root = $("roundList");
  root.replaceChildren();
  session.matches.forEach(match => {
    const button = buildResultRoundCard(session, match, {
      interactive: true,
      current: match.id === session.runtime.currentMatchId
    });
    button.addEventListener("click", () => {
      goToMatch(match.id);
      switchView("score");
    });
    root.append(button);
  });
}

function liveTimestamp(value) {
  const raw = value?.$date || value;
  const date = raw ? new Date(raw) : null;
  if (!date || Number.isNaN(date.getTime())) return "";
  return date.toLocaleTimeString("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false
  });
}

function renderLiveViewer(room = liveRoomData) {
  if (!room?.session) return;
  const session = room.session;
  const match = currentMatch(session);
  const done = session.matches.filter(item => item.status === "completed").length;
  document.body.classList.toggle("live-ended", room.live === false);
  $("liveSessionName").textContent = session.name;
  $("liveStatusText").textContent = room.live === false
    ? "本次共享已结束，以下是最后一次记录"
    : "比分由主持人实时更新";
  $("liveUpdatedAt").textContent = liveTimestamp(room.updatedAt)
    ? `更新 ${liveTimestamp(room.updatedAt)}`
    : "";
  $("liveProgressText").textContent = match
    ? `第 ${match.order} / ${session.matches.length} 场 · 已完成 ${done} 场`
    : `共 ${session.matches.length} 场`;
  if (!match) return;

  const players = playerMap(session);
  $("liveRoundBadge").textContent = `第 ${match.order} 场`;
  $("liveTypeText").textContent = matchTypeLabel(match.type);
  $("liveLeftTeam").textContent = match.teams[0].map(id => players.get(id)?.name).join("＋");
  $("liveRightTeam").textContent = match.teams[1].map(id => players.get(id)?.name).join("＋");
  const recorded = match.scoreRecorded !== false;
  $("liveScoreBlock").classList.toggle("hidden", !recorded);
  $("liveScoreMessage").classList.toggle("hidden", recorded);
  $("liveScoreA").textContent = String(match.score?.a ?? 0);
  $("liveScoreB").textContent = String(match.score?.b ?? 0);
  $("liveTimer").textContent = formatDuration(displayedElapsed(session, match));

  const { ranking, validMatches } = calculateRanking(session);
  $("liveRankingStatus").textContent = `${validMatches} 场有效结果`;
  const rankingRoot = $("liveRankingList");
  rankingRoot.replaceChildren();
  ranking.forEach(player => {
    const row = element("div", `ranking-row${player.rank === 1 && validMatches ? " top" : ""}`);
    const rank = validMatches
      ? player.rank === 1 ? "🥇" : player.rank === 2 ? "🥈" : player.rank === 3 ? "🥉" : String(player.rank)
      : "—";
    const net = player.net > 0 ? `+${player.net}` : String(player.net);
    row.append(
      element("span", "", rank),
      element("span", "", player.name),
      element("span", "", String(player.wins)),
      element("span", "", String(player.losses)),
      element("span", player.net > 0 ? "positive" : player.net < 0 ? "negative" : "", net)
    );
    rankingRoot.append(row);
  });

  const roundRoot = $("liveRoundList");
  roundRoot.replaceChildren();
  session.matches.forEach(item => {
    roundRoot.append(buildResultRoundCard(session, item, {
      current: item.id === session.runtime.currentMatchId
    }));
  });
}

function showLiveViewerError(message) {
  $("liveSessionName").textContent = "暂时无法观看";
  $("liveStatusText").textContent = message;
  $("liveProgressText").textContent = "请稍后刷新页面";
}

function startLivePolling(roomId) {
  if (livePollTimer) return;
  livePollTimer = setInterval(async () => {
    try {
      const room = await getLiveRoom(roomId);
      if (room) {
        liveRoomData = room;
        renderLiveViewer();
      }
    } catch {
      // Keep the last received result visible while the network recovers.
    }
  }, 5000);
}

async function initLiveViewer(roomId) {
  document.body.classList.add("viewer-mode");
  $("liveView").classList.remove("hidden");
  try {
    const room = await getLiveRoom(roomId);
    if (!room) {
      showLiveViewerError("观战房间不存在或已经失效");
      return;
    }
    liveRoomData = room;
    renderLiveViewer();
    liveWatcher = await watchLiveRoom(roomId, {
      onChange(nextRoom) {
        if (!nextRoom) return;
        liveRoomData = nextRoom;
        renderLiveViewer();
      },
      onError() {
        $("liveStatusText").textContent = "实时连接不稳定，正在自动刷新";
        startLivePolling(roomId);
      }
    });
  } catch (error) {
    showLiveViewerError(error?.message || "连接实时房间失败");
    startLivePolling(roomId);
  }
}

function renderOverview() {
  const session = currentSession();
  $("overviewEmpty").classList.toggle("hidden", Boolean(session));
  $("overviewContent").classList.toggle("hidden", !session);
  if (!session) return;
  renderRanking(session);
  renderQuality(session);
  renderRoundList(session);
}

function renderHistory() {
  const root = $("historyList");
  root.replaceChildren();
  if (!store.sessions.length) {
    root.append(element("div", "empty panel", "还没有活动记录。"));
    return;
  }
  [...store.sessions]
    .sort((left, right) => new Date(right.updatedAt) - new Date(left.updatedAt))
    .forEach(session => {
      const card = element("section", "panel history-card");
      const done = session.matches.filter(match => match.status === "completed").length;
      const modeLabel = session.scheduleConfig.mode === "singles" ||
        session.scheduleConfig.allowedTypes?.includes("singles") ? "单打" : "双打";
      card.append(
        element("h2", "", session.name),
        element("div", "history-meta",
          `${new Date(session.updatedAt).toLocaleString("zh-CN", { hour12: false })} · ${modeLabel} · ${session.players.length}人 · ${done}/${session.matches.length}场`)
      );
      const actions = element("div", "history-actions");
      const open = element("button", "", "继续");
      open.addEventListener("click", () => {
        setActiveSession(store, session.id);
        renderAll();
        switchView("score");
      });
      const share = element("button", "", "分享");
      share.addEventListener("click", async () => {
        try {
          await shareResultImage(session);
          showToast("比赛图片已生成");
        } catch (error) {
          if (error?.name !== "AbortError") showToast(error.message || "分享失败");
        }
      });
      const remove = element("button", "danger", "删除");
      remove.addEventListener("click", () => {
        if (!confirm(`确定删除“${session.name}”吗？此操作只删除当前设备上的新版记录。`)) return;
        removeSession(store, session.id);
        renderAll();
        showToast("活动已删除");
      });
      actions.append(open, share, remove);
      card.append(actions);
      root.append(card);
    });
}

function renderAll() {
  const session = currentSession();
  $("sessionSubtitle").textContent = session ? session.name : "排赛、计分与排名";
  renderPreview();
  renderScore();
  renderLiveShare(session);
  renderOverview();
  renderHistory();
}

function goToMatch(matchId) {
  const session = currentSession();
  if (!session || !session.matches.some(match => match.id === matchId)) return;
  pauseTimer(session, false);
  session.runtime.currentMatchId = matchId;
  persistSession(session);
  renderAll();
  vibrate(8);
}

function adjacentMatch(delta) {
  const session = currentSession();
  const match = currentMatch(session);
  if (!session || !match) return;
  const index = session.matches.findIndex(item => item.id === match.id);
  const next = session.matches[index + delta];
  if (next) goToMatch(next.id);
}

function normalizeScoreValue(value) {
  const parsed = Math.floor(Number(value));
  return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
}

function changeScore(side, nextValue, { render = true, feedback = true } = {}) {
  const session = currentSession();
  const match = currentMatch(session);
  if (!session || !match) return;
  match.score[side] = normalizeScoreValue(nextValue);
  match.scoreRecorded = true;
  if (match.status === "completed") {
    match.status = "pending";
    match.completedAt = null;
    session.status = "active";
  }
  persistSession(session);
  if (render) renderAll();
  if (feedback) vibrate(8);
}

function setScoreRecorded(enabled) {
  const session = currentSession();
  const match = currentMatch(session);
  if (!session || !match) return;
  match.scoreRecorded = enabled;
  if (match.status === "completed") {
    match.status = "pending";
    match.completedAt = null;
    session.status = "active";
  }
  persistSession(session);
  renderAll();
  if (enabled) requestAnimationFrame(() => $("scoreA").focus());
  vibrate(8);
}

function finishCurrentMatch() {
  const session = currentSession();
  const match = currentMatch(session);
  if (!session || !match) return;
  if (match.scoreRecorded !== false) {
    match.score.a = normalizeScoreValue($("scoreA").value);
    match.score.b = normalizeScoreValue($("scoreB").value);
  }
  pauseTimer(session, false);
  match.status = "completed";
  match.completedAt ||= new Date().toISOString();
  const index = session.matches.findIndex(item => item.id === match.id);
  const next = session.matches.find((item, itemIndex) => item.status !== "completed" && itemIndex > index) ||
    session.matches.find(item => item.status !== "completed");
  if (next) {
    session.runtime.currentMatchId = next.id;
    showToast(match.scoreRecorded === false ? "比赛已结束，未记录比分" : "比赛及比分已保存");
  } else {
    session.status = "completed";
    showToast("全部比赛完成，有效比分已计入排名");
  }
  persistSession(session);
  renderAll();
  vibrate([20, 30, 20]);
  if (!next) setTimeout(() => switchView("overview"), 350);
}

async function runScheduleGeneration({ button, loadingText, idleText, create }) {
  button.disabled = true;
  button.textContent = loadingText;
  preview = null;
  renderPreview();
  await new Promise(resolve => setTimeout(resolve, 30));
  try {
    preview = create();
    renderPreview();
    $("schedulePreview").scrollIntoView({ behavior: "smooth", block: "start" });
  } catch (error) {
    const panel = $("schedulePreview");
    panel.replaceChildren(element("section", "panel error-card", error.message || "生成赛程失败"));
    panel.classList.remove("hidden");
  } finally {
    button.disabled = false;
    button.textContent = idleText;
  }
}

$("doublesScheduleForm").addEventListener("submit", async event => {
  event.preventDefault();
  await runScheduleGeneration({
    button: $("generateDoublesBtn"),
    loadingText: "正在计算双打赛程…",
    idleText: "生成双打赛程",
    create: () => {
      const maleNames = parseNames($("malePlayers").value);
      const femaleNames = parseNames($("femalePlayers").value);
      const players = createPlayers(maleNames, femaleNames);
      const seed = `${Date.now()}-${players.map(player => player.name).join("-")}`;
      const result = generateSchedule(players, $("matchCount").value, seed);
      return { mode: "doubles", name: $("doublesSessionName").value, players, result };
    }
  });
});

$("singlesScheduleForm").addEventListener("submit", async event => {
  event.preventDefault();
  await runScheduleGeneration({
    button: $("generateSinglesBtn"),
    loadingText: "正在生成单打轮转…",
    idleText: "生成单打轮转",
    create: () => {
      const players = createSinglesPlayers(parseNames($("singlesPlayers").value));
      const seed = `${Date.now()}-${players.map(player => player.name).join("-")}`;
      const result = generateSinglesSchedule(players, seed);
      return { mode: "singles", name: $("singlesSessionName").value, players, result };
    }
  });
});

$("doublesModeBtn").addEventListener("click", () => switchSetupMode("doubles"));
$("singlesModeBtn").addEventListener("click", () => switchSetupMode("singles"));

rosterFields.forEach(field => {
  $(field.inputId).addEventListener("input", () => updateRosterCount(field));
  updateRosterCount(field);
});

document.querySelectorAll("[data-paste-target]").forEach(button => {
  button.addEventListener("click", () => pasteRosterFromClipboard(button.dataset.pasteTarget));
});

document.querySelectorAll(".bottom-tabs button").forEach(button => {
  button.addEventListener("click", () => switchView(button.dataset.view));
});

document.querySelectorAll("[data-score-side]").forEach(button => {
  button.addEventListener("click", () => {
    const match = currentMatch();
    if (!match) return;
    const side = button.dataset.scoreSide;
    const next = button.dataset.value !== undefined
      ? Number(button.dataset.value)
      : Number(match.score[side]) + Number(button.dataset.delta);
    changeScore(side, next);
  });
});
$("toggleScoreBtn").addEventListener("click", () => setScoreRecorded(true));
$("cancelScoreBtn").addEventListener("click", () => setScoreRecorded(false));
[
  ["scoreA", "a"],
  ["scoreB", "b"]
].forEach(([inputId, side]) => {
  $(inputId).addEventListener("input", event => {
    changeScore(side, event.target.value, { render: false, feedback: false });
  });
});

$("startBtn").addEventListener("click", () => {
  const session = currentSession();
  const match = currentMatch(session);
  if (!session || !match || session.runtime.runningMatchId) return;
  session.runtime.runningMatchId = match.id;
  session.runtime.startedAt = Date.now();
  persistSession(session);
  requestWakeLock();
  renderScore();
  vibrate();
});
$("pauseBtn").addEventListener("click", () => {
  pauseTimer();
  renderAll();
  vibrate();
});
$("finishBtn").addEventListener("click", finishCurrentMatch);
$("prevBtn").addEventListener("click", () => adjacentMatch(-1));
$("nextBtn").addEventListener("click", () => adjacentMatch(1));
$("startLiveBtn").addEventListener("click", startLiveSharing);
$("copyLiveBtn").addEventListener("click", copyLiveLink);
$("systemShareLiveBtn").addEventListener("click", shareLiveLink);
$("stopLiveBtn").addEventListener("click", stopLiveSharing);
$("copyBtn").addEventListener("click", async () => {
  const session = currentSession();
  if (!session) return;
  showToast(await copySessionCSV(session) ? "记录已复制" : "复制失败");
});
$("shareBtn").addEventListener("click", async () => {
  const session = currentSession();
  if (!session) return;
  try {
    showToast("正在生成比赛图片…");
    const result = await shareResultImage(session);
    showToast(result === "shared" ? "已打开系统分享" : "PNG图片已生成");
  } catch (error) {
    if (error?.name !== "AbortError") showToast(error.message || "分享失败");
  }
});
const swipeArea = $("swipeArea");
swipeArea.addEventListener("touchstart", event => {
  touchStartX = event.changedTouches[0].clientX;
}, { passive: true });
swipeArea.addEventListener("touchend", event => {
  if (touchStartX === null) return;
  const difference = event.changedTouches[0].clientX - touchStartX;
  touchStartX = null;
  if (Math.abs(difference) < 65) return;
  adjacentMatch(difference < 0 ? 1 : -1);
}, { passive: true });

setInterval(() => {
  if (liveRoomData) renderLiveViewer();
  const session = currentSession();
  if (session?.runtime.runningMatchId) renderScore();
}, 1000);

document.addEventListener("visibilitychange", () => {
  const session = currentSession();
  if (document.visibilityState === "visible" && session?.runtime.runningMatchId) requestWakeLock();
});
window.addEventListener("beforeunload", () => {
  liveWatcher?.close?.();
  clearInterval(livePollTimer);
  const session = currentSession();
  if (session?.runtime.runningMatchId) {
    commitRunningTime(session);
    saveStore(store);
  }
});

if ("serviceWorker" in navigator) {
  window.addEventListener("load", async () => {
    try {
      const registration = await navigator.serviceWorker.register("./sw.js?v=15", { updateViaCache: "none" });
      await registration.update();
    } catch (error) {
      console.warn("Service Worker 更新失败：", error);
    }
  });
}

if (requestedLiveRoomId) {
  initLiveViewer(requestedLiveRoomId);
} else {
  renderAll();
}
