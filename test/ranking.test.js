import test from "node:test";
import assert from "node:assert/strict";
import { calculateRanking } from "../src/ranking.js";

test("排名按胜场优先，再按净胜分", () => {
  const session = {
    players: [
      { id: "a", name: "A", order: 0 },
      { id: "b", name: "B", order: 1 },
      { id: "c", name: "C", order: 2 },
      { id: "d", name: "D", order: 3 }
    ],
    matches: [{
      status: "completed",
      teams: [["a", "b"], ["c", "d"]],
      score: { a: 21, b: 15 }
    }]
  };
  const { ranking, validMatches } = calculateRanking(session);
  assert.equal(validMatches, 1);
  assert.deepEqual(ranking.slice(0, 2).map(player => player.name), ["A", "B"]);
  assert.equal(ranking[0].net, 6);
  assert.equal(ranking[2].net, -6);
});

test("单打比赛按每队一人正确统计排名", () => {
  const session = {
    players: [
      { id: "a", name: "A", order: 0 },
      { id: "b", name: "B", order: 1 },
      { id: "c", name: "C", order: 2 },
      { id: "d", name: "D", order: 3 }
    ],
    matches: [
      { status: "completed", teams: [["a"], ["b"]], score: { a: 21, b: 10 } },
      { status: "completed", teams: [["c"], ["d"]], score: { a: 18, b: 21 } }
    ]
  };
  const { ranking, validMatches } = calculateRanking(session);
  assert.equal(validMatches, 2);
  assert.deepEqual(ranking.slice(0, 2).map(player => player.name), ["A", "D"]);
  assert.equal(ranking.find(player => player.name === "A").net, 11);
});

test("已结束但未录入比分的比赛不计入排名", () => {
  const session = {
    players: [
      { id: "a", name: "A", order: 0 },
      { id: "b", name: "B", order: 1 },
      { id: "c", name: "C", order: 2 },
      { id: "d", name: "D", order: 3 }
    ],
    matches: [{
      status: "completed",
      scoreRecorded: false,
      teams: [["a", "b"], ["c", "d"]],
      score: { a: 21, b: 15 }
    }]
  };
  const { ranking, validMatches } = calculateRanking(session);
  assert.equal(validMatches, 0);
  assert.equal(ranking.every(player => player.played === 0), true);
});

test("任意非平局比分均可计入排名", () => {
  const session = {
    players: [
      { id: "a", name: "A", order: 0 },
      { id: "b", name: "B", order: 1 }
    ],
    matches: [{
      status: "completed",
      scoreRecorded: true,
      teams: [["a"], ["b"]],
      score: { a: 11, b: 7 }
    }]
  };
  const { ranking, validMatches } = calculateRanking(session);
  assert.equal(validMatches, 1);
  assert.equal(ranking[0].name, "A");
  assert.equal(ranking[0].net, 4);
});
