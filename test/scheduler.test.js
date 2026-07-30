import test from "node:test";
import assert from "node:assert/strict";
import { generateSchedule, generateSinglesSchedule, resolveSchedulePlan, validateSchedule } from "../src/scheduler.js";

function roster(males, females) {
  return [
    ...Array.from({ length: males }, (_, index) => ({
      id: `m${index + 1}`,
      name: `M${index + 1}`,
      gender: "male",
      order: index
    })),
    ...Array.from({ length: females }, (_, index) => ({
      id: `f${index + 1}`,
      name: `F${index + 1}`,
      gender: "female",
      order: males + index
    }))
  ];
}

test("7人14场时每人严格8场，且比赛类型配额正确", () => {
  const players = roster(4, 3);
  const result = generateSchedule(players, 14, "test-7-players");
  assert.equal(result.plan.targetAppearances, 8);
  assert.deepEqual(result.plan.typeQuotas, { mens: 2, womens: 0, mixed: 12 });
  assert.equal(validateSchedule(result.matches, players, result.plan).valid, true);
  assert.equal(result.quality.appearanceRange, 0);
});

test("6人4男2女自动生成4场男双和8场混双", () => {
  const players = roster(4, 2);
  const result = generateSchedule(players, "auto", "test-6-players");
  assert.equal(result.plan.matchCount, 12);
  assert.deepEqual(result.plan.typeQuotas, { mens: 4, womens: 0, mixed: 8 });
  assert.equal(validateSchedule(result.matches, players, result.plan).valid, true);
});

test("8人5男3女自动避开不可行的14场并推荐12场", () => {
  const plan = resolveSchedulePlan(roster(5, 3), "auto");
  assert.equal(plan.matchCount, 12);
  assert.equal(plan.targetAppearances, 6);
  assert.deepEqual(plan.typeQuotas, { mens: 3, womens: 0, mixed: 9 });
});

test("6人5男1女使用男双和混双对男双，并保持每人8场", () => {
  const players = roster(5, 1);
  const result = generateSchedule(players, "auto", "test-5m-1f");
  assert.equal(result.plan.matchCount, 12);
  assert.equal(result.plan.targetAppearances, 8);
  assert.deepEqual(result.plan.typeQuotas, {
    mens: 4,
    womens: 0,
    mixed: 0,
    mixedMens: 8
  });
  assert.equal(validateSchedule(result.matches, players, result.plan).valid, true);
  assert.equal(result.quality.appearanceRange, 0);
});

test("6人1男5女使用女双和混双对女双，并保持每人8场", () => {
  const players = roster(1, 5);
  const result = generateSchedule(players, "auto", "test-1m-5f");
  assert.equal(result.plan.matchCount, 12);
  assert.equal(result.plan.targetAppearances, 8);
  assert.deepEqual(result.plan.typeQuotas, {
    mens: 0,
    womens: 4,
    mixed: 0,
    mixedWomens: 8
  });
  assert.equal(validateSchedule(result.matches, players, result.plan).valid, true);
  assert.equal(result.quality.appearanceRange, 0);
});

test("相同随机种子产生相同赛程", () => {
  const players = roster(3, 3);
  const first = generateSchedule(players, 12, "stable-seed");
  const second = generateSchedule(players, 12, "stable-seed");
  assert.deepEqual(
    first.matches.map(match => match.teams),
    second.matches.map(match => match.teams)
  );
});

test("6至8人的全部男女比例都能生成绝对公平赛程", () => {
  const cases = [];
  for (let total = 6; total <= 8; total += 1) {
    for (let males = 0; males <= total; males += 1) {
      cases.push([males, total - males]);
    }
  }
  cases.forEach(([males, females]) => {
    const players = roster(males, females);
    const result = generateSchedule(players, "auto", `matrix-${males}-${females}`);
    const validation = validateSchedule(result.matches, players, result.plan);
    assert.equal(validation.valid, true, validation.errors.join("；"));
    assert.equal(result.quality.appearanceRange, 0);
  });
});

test("4人单打生成6场单循环，每人3场且每组只交手一次", () => {
  const players = roster(4, 0).map((player, index) => ({
    ...player,
    id: `s${index + 1}`,
    name: `S${index + 1}`,
    gender: "unspecified"
  }));
  const result = generateSinglesSchedule(players, "singles-test");
  assert.equal(result.plan.matchCount, 6);
  assert.equal(result.plan.targetAppearances, 3);
  assert.equal(validateSchedule(result.matches, players, result.plan).valid, true);

  const appearances = Object.fromEntries(players.map(player => [player.id, 0]));
  const pairs = new Set();
  result.matches.forEach(match => {
    const [left, right] = match.teams.flat();
    appearances[left] += 1;
    appearances[right] += 1;
    pairs.add([left, right].sort().join("|"));
  });
  assert.deepEqual(Object.values(appearances), [3, 3, 3, 3]);
  assert.equal(pairs.size, 6);
  assert.equal(result.quality.maxStreak, 2);
  assert.equal(result.quality.tripleStreaks, 0);
});

test("单打拒绝非4人和重复姓名", () => {
  assert.throws(() => generateSinglesSchedule(roster(3, 0)), /正好输入4名/);
  const players = roster(4, 0);
  players[1].name = players[0].name;
  assert.throws(() => generateSinglesSchedule(players), /姓名不能重复/);
});
