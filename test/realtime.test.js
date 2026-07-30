import test from "node:test";
import assert from "node:assert/strict";
import {
  buildLiveUrl,
  makeRoomCode,
  primarySiteUrl,
  realtimeConfigured,
  roomIdFromUrl,
  sessionForLive
} from "../src/realtime.js";

test("共享房间号固定为不易混淆的10位字符", () => {
  const roomId = makeRoomCode(Uint8Array.from([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]));
  assert.equal(roomId.length, 10);
  assert.match(roomId, /^[23456789A-HJ-NP-Z]{10}$/);
  assert.equal(roomId, "23456789AB");
});

test("观战链接保留路径并移除旧查询参数和锚点", () => {
  const url = buildLiveUrl("23456789AB", "https://colname.github.io/?old=1#ranking");
  assert.equal(url, "https://colname.github.io/?live=23456789AB");
  assert.equal(roomIdFromUrl(url), "23456789AB");
});

test("实时共享只在腾讯稳定版和本地开发地址启用", () => {
  assert.match(primarySiteUrl(), /^https:\/\/.+\.tcloudbaseapp\.com\/$/);
  assert.equal(realtimeConfigured(primarySiteUrl()), true);
  assert.equal(realtimeConfigured("http://localhost:4173/"), true);
  assert.equal(realtimeConfigured("https://colname.github.io/"), false);
});

test("云端快照不包含主持人本地共享控制信息", () => {
  const source = {
    id: "session-1",
    name: "周末比赛",
    liveShare: { roomId: "23456789AB", active: true },
    matches: []
  };
  const snapshot = sessionForLive(source);
  assert.equal(snapshot.liveShare, undefined);
  assert.equal(snapshot.name, "周末比赛");
  assert.notEqual(snapshot, source);
});
