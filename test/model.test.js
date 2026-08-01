import test from "node:test";
import assert from "node:assert/strict";
import { createPlayers, createSinglesPlayers, teamName, validFinalScore } from "../src/model.js";

const rule = { pointsToWin: 21, winBy: 2, maxPoints: 30 };

test("21分制正确处理领先2分和30分封顶", () => {
  assert.equal(validFinalScore({ a: 21, b: 18 }, rule), true);
  assert.equal(validFinalScore({ a: 21, b: 20 }, rule), false);
  assert.equal(validFinalScore({ a: 28, b: 26 }, rule), true);
  assert.equal(validFinalScore({ a: 30, b: 29 }, rule), true);
  assert.equal(validFinalScore({ a: 20, b: 18 }, rule), false);
  assert.equal(validFinalScore({ a: 21, b: 21 }, rule), false);
});

test("双打和单打队员都会保留等级，并以紧凑格式显示", () => {
  const doubles = createPlayers(
    [{ name: "张三", level: "4.0" }],
    [{ name: "李四", level: "2.5" }],
  );
  const singles = createSinglesPlayers([{ name: "王五", level: "3.0" }]);
  assert.equal(doubles[0].level, "4.0");
  assert.equal(singles[0].level, "3.0");
  assert.equal(teamName({ players: doubles }, doubles.map(player => player.id)), "张三〔4.0〕＋李四〔2.5〕");
});
