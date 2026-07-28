import { createPlayers, createSession, formatDuration, matchTypeLabel, playerMap, teamName, validFinalScore } from "./model.js";
import { generateSchedule, MATCH_TYPE_LABELS, parseNames } from "./scheduler.js";
import { activeSession, loadStore, removeSession, saveStore, setActiveSession, upsertSession } from "./storage.js";
import { calculateRanking } from "./ranking.js";
import { copySessionCSV, shareResultImage } from "./export.js";

const $ = id => document.getElementById(id);
const store = loadStore();
let preview = null;
let toastTimer = null;
let wakeLock = null;
let touchStartX = null;

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
  if (persist) upsertSession(store, session);
}

function switchView(viewName) {
  document.querySelectorAll(".view").forEach(view => view.classList.remove("active"));
  document.querySelectorAll(".bottom-tabs button").forEach(button => button.classList.toggle("active", button.dataset.view === viewName));
  $(`${viewName}View`).classList.add("active");
  renderAll();
  window.scrollTo({ top: 0, behavior: "smooth" });
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
  summary.append(
    buildMetric("比赛场数", `${preview.result.plan.matchCount} 场`),
    buildMetric("每人场数", `${preview.result.plan.targetAppearances} 场`),
    buildMetric("最多搭档次数", `${preview.result.quality.partnerMax} 次`),
    buildMetric("最长连续出场", `${preview.result.quality.maxStreak} 场`)
  );
  panel.append(summary);

  const quotaText = Object.entries(preview.result.plan.typeQuotas)
    .filter(([, count]) => count > 0)
    .map(([type, count]) => `${MATCH_TYPE_LABELS[type]} ${count} 场`)
    .join("＋");
  panel.append(element("p", "note", `比赛配额：${quotaText}；随机种子：${preview.result.seed}`));

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
      name: $("sessionName").value,
      players: preview.players,
      scheduleResult: preview.result
    });
    upsertSession(store, session);
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
  $("scoreA").textContent = match.score.a;
  $("scoreB").textContent = match.score.b;
  $("timer").textContent = formatDuration(displayedElapsed(session, match));
  const running = session.runtime.runningMatchId === match.id;
  $("startBtn").classList.toggle("hidden", running);
  $("pauseBtn").classList.toggle("hidden", !running);
  $("finishBtn").textContent = match.status === "completed"
    ? "✓ 本场已完成，前往下一场"
    : "✓ 完成本场并进入下一场";
  $("prevBtn").disabled = match.order === 1;
  $("nextBtn").disabled = match.order === session.matches.length;
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
  const items = [
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

function renderRoundList(session) {
  const root = $("roundList");
  root.replaceChildren();
  session.matches.forEach(match => {
    const button = element("button", `round-item${match.id === session.runtime.currentMatchId ? " current" : ""}${match.status === "completed" ? " done" : ""}`);
    button.type = "button";
    const main = element("span");
    main.append(
      element("span", "match-line", `${teamName(session, match.teams[0])} vs ${teamName(session, match.teams[1])}`),
      element("div", "round-meta", `${match.score.a} : ${match.score.b} · ${formatDuration(match.elapsedSeconds)}`)
    );
    button.append(
      element("span", "round-number", `第${match.order}场`),
      main,
      element("span", "type-pill", match.status === "completed" ? "✅" : matchTypeLabel(match.type))
    );
    button.addEventListener("click", () => {
      goToMatch(match.id);
      switchView("score");
    });
    root.append(button);
  });
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
      card.append(
        element("h2", "", session.name),
        element("div", "history-meta",
          `${new Date(session.updatedAt).toLocaleString("zh-CN", { hour12: false })} · ${session.players.length}人 · ${done}/${session.matches.length}场`)
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
  renderOverview();
  renderHistory();
}

function goToMatch(matchId) {
  const session = currentSession();
  if (!session || !session.matches.some(match => match.id === matchId)) return;
  pauseTimer(session, false);
  session.runtime.currentMatchId = matchId;
  upsertSession(store, session);
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

function changeScore(side, nextValue) {
  const session = currentSession();
  const match = currentMatch(session);
  if (!session || !match) return;
  match.score[side] = Math.max(0, Math.min(30, Number(nextValue) || 0));
  if (match.status === "completed") {
    match.status = "pending";
    match.completedAt = null;
    session.status = "active";
  }
  upsertSession(store, session);
  renderAll();
  vibrate(8);
}

function finishCurrentMatch() {
  const session = currentSession();
  const match = currentMatch(session);
  if (!session || !match) return;
  if (match.status !== "completed" && !validFinalScore(match.score, session.scoringRule)) {
    showToast("21分制需领先2分；29平后30分封顶");
    vibrate([30, 35, 30]);
    return;
  }
  pauseTimer(session, false);
  match.status = "completed";
  match.completedAt ||= new Date().toISOString();
  const index = session.matches.findIndex(item => item.id === match.id);
  const next = session.matches.find((item, itemIndex) => item.status !== "completed" && itemIndex > index) ||
    session.matches.find(item => item.status !== "completed");
  if (next) {
    session.runtime.currentMatchId = next.id;
    showToast("本场已完成");
  } else {
    session.status = "completed";
    showToast("全部比赛完成，最终排名已生成");
  }
  upsertSession(store, session);
  renderAll();
  vibrate([20, 30, 20]);
  if (!next) setTimeout(() => switchView("overview"), 350);
}

$("scheduleForm").addEventListener("submit", async event => {
  event.preventDefault();
  const button = $("generateBtn");
  button.disabled = true;
  button.textContent = "正在计算公平赛程…";
  preview = null;
  renderPreview();
  await new Promise(resolve => setTimeout(resolve, 30));
  try {
    const maleNames = parseNames($("malePlayers").value);
    const femaleNames = parseNames($("femalePlayers").value);
    const players = createPlayers(maleNames, femaleNames);
    const seed = `${Date.now()}-${players.map(player => player.name).join("-")}`;
    const result = generateSchedule(players, $("matchCount").value, seed);
    preview = { players, result };
    renderPreview();
    $("schedulePreview").scrollIntoView({ behavior: "smooth", block: "start" });
  } catch (error) {
    const panel = $("schedulePreview");
    panel.replaceChildren(element("section", "panel error-card", error.message || "生成赛程失败"));
    panel.classList.remove("hidden");
  } finally {
    button.disabled = false;
    button.textContent = "生成公平赛程";
  }
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

$("startBtn").addEventListener("click", () => {
  const session = currentSession();
  const match = currentMatch(session);
  if (!session || !match || session.runtime.runningMatchId) return;
  session.runtime.runningMatchId = match.id;
  session.runtime.startedAt = Date.now();
  upsertSession(store, session);
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
$("newSessionBtn").addEventListener("click", () => {
  preview = null;
  $("scheduleForm").reset();
  renderPreview();
  switchView("setup");
  $("sessionName").focus();
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
  const session = currentSession();
  if (session?.runtime.runningMatchId) renderScore();
}, 1000);

document.addEventListener("visibilitychange", () => {
  const session = currentSession();
  if (document.visibilityState === "visible" && session?.runtime.runningMatchId) requestWakeLock();
});
window.addEventListener("beforeunload", () => {
  const session = currentSession();
  if (session?.runtime.runningMatchId) {
    commitRunningTime(session);
    saveStore(store);
  }
});

if ("serviceWorker" in navigator) {
  window.addEventListener("load", async () => {
    try {
      const registration = await navigator.serviceWorker.register("./sw.js?v=5", { updateViaCache: "none" });
      await registration.update();
    } catch (error) {
      console.warn("Service Worker 更新失败：", error);
    }
  });
}

renderAll();
