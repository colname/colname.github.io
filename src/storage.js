const STORAGE_KEY = "yjun_badminton_v2";
const LEGACY_KEY = "yjun_badminton_iphone_v1";

const LEGACY_MATCHES = [
  { type: "mixed", left: "YJUN＋WY", right: "OTT＋Forest" },
  { type: "mixed", left: "OTT＋WY", right: "WZY＋ZY" },
  { type: "mixed", left: "YJUN＋Forest", right: "WZY＋YBY" },
  { type: "womens", left: "Forest＋WY", right: "ZY＋YBY" },
  { type: "mixed", left: "YJUN＋ZY", right: "WZY＋WY" },
  { type: "mixed", left: "YJUN＋YBY", right: "OTT＋Forest" },
  { type: "mixed", left: "OTT＋WY", right: "WZY＋YBY" },
  { type: "mixed", left: "YJUN＋ZY", right: "WZY＋Forest" },
  { type: "womens", left: "Forest＋ZY", right: "WY＋YBY" },
  { type: "mixed", left: "YJUN＋WY", right: "OTT＋YBY" },
  { type: "mixed", left: "OTT＋ZY", right: "WZY＋Forest" },
  { type: "mixed", left: "YJUN＋Forest", right: "WZY＋WY" },
  { type: "mixed", left: "YJUN＋YBY", right: "OTT＋ZY" },
  { type: "mixed", left: "OTT＋YBY", right: "WZY＋ZY" }
];

function blankStore() {
  return {
    schemaVersion: 2,
    activeSessionId: null,
    sessions: [],
    migratedFromLegacy: false
  };
}

function migrateLegacy(legacy) {
  const names = ["YJUN", "OTT", "WZY", "Forest", "WY", "ZY", "YBY"];
  const players = names.map((name, index) => ({
    id: `legacy_player_${index + 1}`,
    name,
    gender: index < 3 ? "male" : "female",
    order: index
  }));
  const ids = new Map(players.map(player => [player.name, player.id]));
  const now = new Date().toISOString();
  const matches = LEGACY_MATCHES.map((match, index) => ({
    id: `legacy_match_${index + 1}`,
    order: index + 1,
    court: 1,
    type: match.type,
    teams: [
      match.left.split("＋").map(name => ids.get(name)),
      match.right.split("＋").map(name => ids.get(name))
    ],
    status: legacy.completed?.[index] ? "completed" : "pending",
    score: {
      a: Number(legacy.scores?.[index]?.a || 0),
      b: Number(legacy.scores?.[index]?.b || 0)
    },
    elapsedSeconds: Number(legacy.elapsed?.[index] || 0),
    completedAt: legacy.completed?.[index] ? now : null
  }));
  const current = Math.min(Math.max(Number(legacy.current) || 0, 0), matches.length - 1);
  const session = {
    id: "session_legacy_v1",
    name: "旧版14轮活动",
    createdAt: now,
    updatedAt: now,
    status: matches.every(match => match.status === "completed") ? "completed" : "active",
    venueCount: 1,
    players,
    scoringRule: { pointsToWin: 21, winBy: 2, maxPoints: 30 },
    scheduleConfig: {
      requestedGames: 14,
      matchCount: 14,
      targetAppearances: 8,
      allowedTypes: ["womens", "mixed"],
      typeQuotas: { mens: 0, womens: 2, mixed: 12 },
      seed: "legacy-v1",
      algorithmVersion: "legacy",
      quality: null
    },
    matches,
    runtime: {
      currentMatchId: matches[current].id,
      runningMatchId: null,
      startedAt: null
    }
  };
  return {
    schemaVersion: 2,
    activeSessionId: session.id,
    sessions: [session],
    migratedFromLegacy: true
  };
}

function normalizeStore(value) {
  if (!value || value.schemaVersion !== 2 || !Array.isArray(value.sessions)) return blankStore();
  value.sessions.forEach(session => {
    session.runtime ||= { currentMatchId: session.matches[0]?.id || null, runningMatchId: null, startedAt: null };
    session.matches ||= [];
  });
  return value;
}

export function loadStore() {
  try {
    const current = localStorage.getItem(STORAGE_KEY);
    if (current) return normalizeStore(JSON.parse(current));

    const legacyRaw = localStorage.getItem(LEGACY_KEY);
    if (legacyRaw) {
      const store = migrateLegacy(JSON.parse(legacyRaw));
      saveStore(store);
      return store;
    }
  } catch (error) {
    console.warn("读取本地记录失败：", error);
  }
  return blankStore();
}

export function saveStore(store) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
}

export function activeSession(store) {
  return store.sessions.find(session => session.id === store.activeSessionId) || null;
}

export function upsertSession(store, session, makeActive = true) {
  session.updatedAt = new Date().toISOString();
  const index = store.sessions.findIndex(item => item.id === session.id);
  if (index === -1) store.sessions.unshift(session);
  else store.sessions[index] = session;
  if (makeActive) store.activeSessionId = session.id;
  saveStore(store);
}

export function removeSession(store, sessionId) {
  store.sessions = store.sessions.filter(session => session.id !== sessionId);
  if (store.activeSessionId === sessionId) {
    store.activeSessionId = store.sessions[0]?.id || null;
  }
  saveStore(store);
}

export function setActiveSession(store, sessionId) {
  store.activeSessionId = sessionId;
  saveStore(store);
}
