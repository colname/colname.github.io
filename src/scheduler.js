export const MATCH_TYPE_LABELS = {
  mens: "男双",
  womens: "女双",
  mixed: "混双"
};

const GAME_OPTIONS = [6, 9, 12, 14, 15, 21];

export function parseNames(value) {
  return String(value || "")
    .split(/[\s,，、;；]+/)
    .map(name => name.trim())
    .filter(Boolean);
}

function createRng(seedText) {
  let hash = 2166136261;
  for (const char of String(seedText)) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return () => {
    hash += 0x6d2b79f5;
    let value = hash;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function combinations(items, size) {
  const result = [];
  const walk = (start, selected) => {
    if (selected.length === size) {
      result.push([...selected]);
      return;
    }
    for (let index = start; index <= items.length - (size - selected.length); index += 1) {
      selected.push(items[index]);
      walk(index + 1, selected);
      selected.pop();
    }
  };
  walk(0, []);
  return result;
}

const pairKey = (a, b) => [a, b].sort().join("|");

function validateRoster(players) {
  if (players.length < 6 || players.length > 8) {
    throw new Error("目前仅支持 6–8 人排赛。");
  }

  const normalized = players.map(player => player.name.trim().toLocaleLowerCase("zh-CN"));
  if (new Set(normalized).size !== normalized.length) {
    throw new Error("姓名不能重复，同一人也不能同时出现在男女列表。");
  }

  const maleCount = players.filter(player => player.gender === "male").length;
  const femaleCount = players.filter(player => player.gender === "female").length;
  const signature = `${maleCount}-${femaleCount}`;

  if (players.length === 6 && !["3-3", "4-2", "2-4"].includes(signature)) {
    throw new Error("6人赛目前支持 3男3女、4男2女或2男4女。");
  }
  if (players.length === 7 && !["4-3", "3-4"].includes(signature)) {
    if (["5-2", "2-5"].includes(signature)) {
      throw new Error("暂不支持 5男2女或2男5女。");
    }
    throw new Error("7人赛目前支持 4男3女或3男4女。");
  }
  if (players.length === 8 && maleCount > 0 && femaleCount > 0 && Math.min(maleCount, femaleCount) < 2) {
    throw new Error("标准混双每场需要至少2名男生和2名女生，当前8人性别组合无法公平排赛。");
  }

  return { maleCount, femaleCount };
}

function calculatePlanForGames(players, games) {
  const { maleCount, femaleCount } = validateRoster(players);
  const targetAppearances = games * 4 / players.length;
  if (!Number.isInteger(targetAppearances)) return null;

  const typeQuotas = { mens: 0, womens: 0, mixed: 0 };
  let allowedTypes = [];

  if (femaleCount === 0) {
    typeQuotas.mens = games;
    allowedTypes = ["mens"];
  } else if (maleCount === 0) {
    typeQuotas.womens = games;
    allowedTypes = ["womens"];
  } else if (maleCount === femaleCount) {
    typeQuotas.mixed = games;
    allowedTypes = ["mixed"];
  } else if (maleCount > femaleCount) {
    const mixed = femaleCount * targetAppearances / 2;
    const mens = games - mixed;
    if (!Number.isInteger(mixed) || !Number.isInteger(mens) || mixed < 0 || mens < 0) return null;
    if (4 * mens + 2 * mixed !== maleCount * targetAppearances) return null;
    typeQuotas.mens = mens;
    typeQuotas.mixed = mixed;
    allowedTypes = ["mens", "mixed"];
  } else {
    const mixed = maleCount * targetAppearances / 2;
    const womens = games - mixed;
    if (!Number.isInteger(mixed) || !Number.isInteger(womens) || mixed < 0 || womens < 0) return null;
    if (4 * womens + 2 * mixed !== femaleCount * targetAppearances) return null;
    typeQuotas.womens = womens;
    typeQuotas.mixed = mixed;
    allowedTypes = ["womens", "mixed"];
  }

  return {
    matchCount: games,
    targetAppearances,
    allowedTypes,
    typeQuotas,
    maleCount,
    femaleCount
  };
}

export function resolveSchedulePlan(players, requestedGames = "auto") {
  validateRoster(players);
  const preferred = players.length === 6
    ? [12, 9, 15, 6, 21, 14]
    : [14, 12, 21, 6, 9, 15];

  if (requestedGames === "auto") {
    for (const games of preferred) {
      const plan = calculatePlanForGames(players, games);
      if (plan) return plan;
    }
    throw new Error("没有找到可以同时满足赛制和场次绝对公平的场数。");
  }

  const games = Number(requestedGames);
  if (!GAME_OPTIONS.includes(games)) {
    throw new Error("请选择有效的比赛场数。");
  }
  const plan = calculatePlanForGames(players, games);
  if (plan) return plan;

  const alternatives = GAME_OPTIONS.filter(value => calculatePlanForGames(players, value));
  const suggestion = alternatives.length ? ` 可选择：${alternatives.join("、")}场。` : "";
  throw new Error(`当前场数无法同时满足合法赛制和每人场次完全一致。${suggestion}`);
}

function makeSameGenderMatches(players, type) {
  const result = [];
  for (const group of combinations(players, 4)) {
    const [a, b, c, d] = group;
    const pairings = [
      [[a, b], [c, d]],
      [[a, c], [b, d]],
      [[a, d], [b, c]]
    ];
    for (const teams of pairings) {
      result.push(makeCandidate(type, teams));
    }
  }
  return result;
}

function makeMixedMatches(males, females) {
  const result = [];
  for (const malePair of combinations(males, 2)) {
    for (const femalePair of combinations(females, 2)) {
      result.push(makeCandidate("mixed", [
        [malePair[0], femalePair[0]],
        [malePair[1], femalePair[1]]
      ]));
      result.push(makeCandidate("mixed", [
        [malePair[0], femalePair[1]],
        [malePair[1], femalePair[0]]
      ]));
    }
  }
  return result;
}

function makeCandidate(type, teams) {
  const teamIds = teams.map(team => team.map(player => player.id));
  const participants = teamIds.flat();
  const partnerKeys = teamIds.map(team => pairKey(team[0], team[1]));
  const opponentKeys = [];
  for (const left of teamIds[0]) {
    for (const right of teamIds[1]) opponentKeys.push(pairKey(left, right));
  }
  return {
    type,
    teams: teamIds,
    participants,
    partnerKeys,
    opponentKeys,
    signature: teamIds
      .map(team => [...team].sort().join("+"))
      .sort()
      .join("vs")
  };
}

function generateCandidates(players, allowedTypes) {
  const males = players.filter(player => player.gender === "male");
  const females = players.filter(player => player.gender === "female");
  const byType = { mens: [], womens: [], mixed: [] };
  if (allowedTypes.includes("mens")) byType.mens = makeSameGenderMatches(males, "mens");
  if (allowedTypes.includes("womens")) byType.womens = makeSameGenderMatches(females, "womens");
  if (allowedTypes.includes("mixed")) byType.mixed = makeMixedMatches(males, females);
  return byType;
}

function incrementMap(map, keys, delta) {
  for (const key of keys) {
    const next = (map.get(key) || 0) + delta;
    if (next === 0) map.delete(key);
    else map.set(key, next);
  }
}

function candidateHeuristic(candidate, state, rng) {
  const appearances = candidate.participants.reduce((sum, id) => sum + state.counts.get(id), 0);
  const partnerRepeat = candidate.partnerKeys.reduce((sum, key) => sum + (state.partners.get(key) || 0), 0);
  const opponentRepeat = candidate.opponentKeys.reduce((sum, key) => sum + (state.opponents.get(key) || 0), 0);
  const previous = state.schedule.at(-1)?.participants || [];
  const beforePrevious = state.schedule.at(-2)?.participants || [];
  const consecutive = candidate.participants.filter(id => previous.includes(id)).length;
  const triple = candidate.participants.filter(id => previous.includes(id) && beforePrevious.includes(id)).length;
  return appearances * 100 + partnerRepeat * 24 + opponentRepeat * 5 + triple * 3 + consecutive + rng();
}

function schedulePairCounts(schedule, field) {
  const counts = new Map();
  for (const match of schedule) incrementMap(counts, match[field], 1);
  return counts;
}

function continuityMetrics(schedule, playerIds) {
  let maxStreak = 0;
  let consecutiveTransitions = 0;
  let tripleStreaks = 0;
  for (const playerId of playerIds) {
    let streak = 0;
    for (const match of schedule) {
      if (match.participants.includes(playerId)) {
        streak += 1;
        if (streak >= 2) consecutiveTransitions += 1;
        if (streak >= 3) tripleStreaks += 1;
        maxStreak = Math.max(maxStreak, streak);
      } else {
        streak = 0;
      }
    }
  }
  return { maxStreak, consecutiveTransitions, tripleStreaks };
}

function valuesForUniverse(counts, universe) {
  return [...universe].map(key => counts.get(key) || 0);
}

function buildQuality(schedule, players, candidates, targetAppearances) {
  const appearanceCounts = Object.fromEntries(players.map(player => [player.id, 0]));
  for (const match of schedule) {
    for (const id of match.participants) appearanceCounts[id] += 1;
  }

  const partnerCounts = schedulePairCounts(schedule, "partnerKeys");
  const opponentCounts = schedulePairCounts(schedule, "opponentKeys");
  const partnerUniverse = new Set();
  const opponentUniverse = new Set();
  Object.values(candidates).flat().forEach(candidate => {
    candidate.partnerKeys.forEach(key => partnerUniverse.add(key));
    candidate.opponentKeys.forEach(key => opponentUniverse.add(key));
  });
  const partnerValues = valuesForUniverse(partnerCounts, partnerUniverse);
  const opponentValues = valuesForUniverse(opponentCounts, opponentUniverse);
  const continuity = continuityMetrics(schedule, players.map(player => player.id));

  const partnerMax = Math.max(0, ...partnerValues);
  const partnerMin = Math.min(0, ...partnerValues);
  const opponentMax = Math.max(0, ...opponentValues);
  const objective = [
    partnerMax - partnerMin,
    partnerValues.reduce((sum, value) => sum + value * value, 0),
    opponentMax,
    opponentValues.reduce((sum, value) => sum + value * value, 0),
    continuity.tripleStreaks,
    continuity.consecutiveTransitions,
    continuity.maxStreak
  ];

  return {
    objective,
    appearanceCounts,
    appearanceRange: Math.max(...Object.values(appearanceCounts)) - Math.min(...Object.values(appearanceCounts)),
    targetAppearances,
    partnerMax,
    opponentMax,
    ...continuity
  };
}

function compareObjective(left, right) {
  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) return left[index] - right[index];
  }
  return 0;
}

function searchOne(players, plan, candidates, rng, nodeLimit, branchLimit) {
  const state = {
    counts: new Map(players.map(player => [player.id, 0])),
    quotas: { ...plan.typeQuotas },
    partners: new Map(),
    opponents: new Map(),
    schedule: [],
    nodes: 0
  };

  const search = () => {
    state.nodes += 1;
    if (state.nodes > nodeLimit) return false;
    if (state.schedule.length === plan.matchCount) {
      return players.every(player => state.counts.get(player.id) === plan.targetAppearances);
    }

    const options = [];
    for (const type of plan.allowedTypes) {
      if (state.quotas[type] <= 0) continue;
      for (const candidate of candidates[type]) {
        if (candidate.participants.some(id => state.counts.get(id) >= plan.targetAppearances)) continue;
        options.push({
          candidate,
          score: candidateHeuristic(candidate, state, rng)
        });
      }
    }
    options.sort((a, b) => a.score - b.score);

    for (const { candidate } of options.slice(0, branchLimit)) {
      state.schedule.push(candidate);
      state.quotas[candidate.type] -= 1;
      candidate.participants.forEach(id => state.counts.set(id, state.counts.get(id) + 1));
      incrementMap(state.partners, candidate.partnerKeys, 1);
      incrementMap(state.opponents, candidate.opponentKeys, 1);

      const remaining = plan.matchCount - state.schedule.length;
      const viable = players.every(player => {
        const deficit = plan.targetAppearances - state.counts.get(player.id);
        return deficit >= 0 && deficit <= remaining;
      });

      if (viable && search()) return true;

      incrementMap(state.opponents, candidate.opponentKeys, -1);
      incrementMap(state.partners, candidate.partnerKeys, -1);
      candidate.participants.forEach(id => state.counts.set(id, state.counts.get(id) - 1));
      state.quotas[candidate.type] += 1;
      state.schedule.pop();
    }
    return false;
  };

  return search() ? [...state.schedule] : null;
}

export function validateSchedule(schedule, players, plan) {
  const errors = [];
  const counts = new Map(players.map(player => [player.id, 0]));
  const quotas = { mens: 0, womens: 0, mixed: 0 };
  const genders = new Map(players.map(player => [player.id, player.gender]));

  if (schedule.length !== plan.matchCount) errors.push("比赛场数不正确");
  schedule.forEach((match, index) => {
    const participants = match.teams.flat();
    if (participants.length !== 4 || new Set(participants).size !== 4) {
      errors.push(`第${index + 1}场不是4名不同队员`);
    }
    participants.forEach(id => counts.set(id, (counts.get(id) || 0) + 1));
    quotas[match.type] += 1;
    if (match.type === "mixed") {
      const valid = match.teams.every(team => {
        const teamGenders = team.map(id => genders.get(id)).sort().join(",");
        return teamGenders === "female,male";
      });
      if (!valid) errors.push(`第${index + 1}场混双组合不合法`);
    } else {
      const expected = match.type === "mens" ? "male" : "female";
      if (participants.some(id => genders.get(id) !== expected)) {
        errors.push(`第${index + 1}场${MATCH_TYPE_LABELS[match.type]}组合不合法`);
      }
    }
  });

  players.forEach(player => {
    if (counts.get(player.id) !== plan.targetAppearances) {
      errors.push(`${player.name}的出场次数不等于${plan.targetAppearances}`);
    }
  });
  Object.keys(plan.typeQuotas).forEach(type => {
    if (quotas[type] !== plan.typeQuotas[type]) errors.push(`${MATCH_TYPE_LABELS[type]}场数不正确`);
  });
  return { valid: errors.length === 0, errors };
}

export function generateSchedule(players, requestedGames = "auto", seed = Date.now().toString()) {
  const plan = resolveSchedulePlan(players, requestedGames);
  const candidates = generateCandidates(players, plan.allowedTypes);
  for (const type of plan.allowedTypes) {
    if (!candidates[type].length && plan.typeQuotas[type] > 0) {
      throw new Error(`没有足够人员组成合法${MATCH_TYPE_LABELS[type]}。`);
    }
  }

  let best = null;
  let bestQuality = null;
  const attempts = 48;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const rng = createRng(`${seed}:${attempt}`);
    const schedule = searchOne(players, plan, candidates, rng, 90000, attempt < 8 ? 52 : 30);
    if (!schedule) continue;
    const quality = buildQuality(schedule, players, candidates, plan.targetAppearances);
    if (!bestQuality || compareObjective(quality.objective, bestQuality.objective) < 0) {
      best = schedule;
      bestQuality = quality;
    }
  }

  if (!best) {
    throw new Error("没有在计算限制内找到合法赛程，请重新生成或调整场数。");
  }

  const matches = best.map((candidate, index) => ({
    id: `match_${index + 1}`,
    order: index + 1,
    court: 1,
    type: candidate.type,
    teams: candidate.teams.map(team => [...team]),
    status: "pending",
    score: { a: 0, b: 0 },
    elapsedSeconds: 0,
    completedAt: null
  }));
  const validation = validateSchedule(matches, players, plan);
  if (!validation.valid) {
    throw new Error(`赛程内部校验失败：${validation.errors.join("；")}`);
  }

  return {
    plan,
    matches,
    seed: String(seed),
    quality: bestQuality
  };
}
