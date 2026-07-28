import test from "node:test";
import assert from "node:assert/strict";
import { generateSchedule, resolveSchedulePlan, validateSchedule } from "../src/scheduler.js";

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

test("明确拒绝暂不支持的5男2女", () => {
  assert.throws(() => resolveSchedulePlan(roster(5, 2), "auto"), /暂不支持/);
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

test("所有已支持的男女组合都能生成通过内部校验的赛程", () => {
  const cases = [
    [3, 3], [4, 2], [2, 4],
    [4, 3], [3, 4],
    [4, 4], [5, 3], [3, 5], [6, 2], [2, 6]
  ];
  cases.forEach(([males, females]) => {
    const players = roster(males, females);
    const result = generateSchedule(players, "auto", `matrix-${males}-${females}`);
    const validation = validateSchedule(result.matches, players, result.plan);
    assert.equal(validation.valid, true, validation.errors.join("；"));
    assert.equal(result.quality.appearanceRange, 0);
  });
});
