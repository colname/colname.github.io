import test from "node:test";
import assert from "node:assert/strict";
import { parseRosterText } from "../src/roster.js";

test("识别带标题和顿号编号的接龙", () => {
  assert.deepEqual(
    parseRosterText("单打循环赛，接龙示例：\n\n1、林丹\n2、何冰娇\n3、安赛龙\n4、李宗伟"),
    ["林丹", "何冰娇", "安赛龙", "李宗伟"],
  );
});

test("兼容常见接龙编号格式", () => {
  assert.deepEqual(
    parseRosterText("1. 张三\n2）李四\n（3）王五\n4 赵六"),
    ["张三", "李四", "王五", "赵六"],
  );
});

test("保留原有空格、逗号和换行输入方式", () => {
  assert.deepEqual(parseRosterText("张三 李四，王五\n赵六"), ["张三", "李四", "王五", "赵六"]);
});
