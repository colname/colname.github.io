export function makeId(prefix) {
  const random = globalThis.crypto?.randomUUID?.() ||
    `${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}`;
  return `${prefix}_${random}`;
}

export function createPlayers(maleNames, femaleNames) {
  return [
    ...maleNames.map((name, index) => ({
      id: makeId("player"),
      name: name.trim(),
      gender: "male",
      order: index
    })),
    ...femaleNames.map((name, index) => ({
      id: makeId("player"),
      name: name.trim(),
      gender: "female",
      order: maleNames.length + index
    }))
  ];
}

export function createSession({ name, players, scheduleResult }) {
  const now = new Date().toISOString();
  return {
    id: makeId("session"),
    name: name.trim() || `${new Date().toLocaleDateString("zh-CN")} 羽毛球`,
    createdAt: now,
    updatedAt: now,
    status: "active",
    venueCount: 1,
    players,
    scoringRule: {
      pointsToWin: 21,
      winBy: 2,
      maxPoints: 30
    },
    scheduleConfig: {
      requestedGames: scheduleResult.plan.matchCount,
      matchCount: scheduleResult.plan.matchCount,
      targetAppearances: scheduleResult.plan.targetAppearances,
      allowedTypes: scheduleResult.plan.allowedTypes,
      typeQuotas: scheduleResult.plan.typeQuotas,
      seed: scheduleResult.seed,
      algorithmVersion: "2.0.0",
      quality: scheduleResult.quality
    },
    matches: scheduleResult.matches,
    runtime: {
      currentMatchId: scheduleResult.matches[0]?.id || null,
      runningMatchId: null,
      startedAt: null
    }
  };
}

export function playerMap(session) {
  return new Map(session.players.map(player => [player.id, player]));
}

export function teamName(session, team) {
  const players = playerMap(session);
  return team.map(id => players.get(id)?.name || "未知队员").join("＋");
}

export function matchTypeLabel(type) {
  return { mens: "男双", womens: "女双", mixed: "混双" }[type] || type;
}

export function validFinalScore(score, rule) {
  const a = Number(score.a);
  const b = Number(score.b);
  if (!Number.isFinite(a) || !Number.isFinite(b) || a === b) return false;
  const high = Math.max(a, b);
  const low = Math.min(a, b);
  if (high === rule.maxPoints) return high > low;
  return high >= rule.pointsToWin && high - low >= rule.winBy;
}

export function formatDuration(seconds) {
  const total = Math.max(0, Math.floor(Number(seconds) || 0));
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}
