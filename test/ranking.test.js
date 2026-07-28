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
