import test from "node:test";
import assert from "node:assert/strict";
import { validFinalScore } from "../src/model.js";

const rule = { pointsToWin: 21, winBy: 2, maxPoints: 30 };

test("21分制正确处理领先2分和30分封顶", () => {
  assert.equal(validFinalScore({ a: 21, b: 18 }, rule), true);
  assert.equal(validFinalScore({ a: 21, b: 20 }, rule), false);
  assert.equal(validFinalScore({ a: 28, b: 26 }, rule), true);
  assert.equal(validFinalScore({ a: 30, b: 29 }, rule), true);
  assert.equal(validFinalScore({ a: 20, b: 18 }, rule), false);
  assert.equal(validFinalScore({ a: 21, b: 21 }, rule), false);
});
