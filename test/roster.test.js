import test from "node:test";
import assert from "node:assert/strict";
import { parseGroupedRosterText, parseRosterText } from "../src/roster.js";

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

test("从完整活动接龙中去除等级并按图标自动分男女", () => {
  const result = parseGroupedRosterText(`
8.3（下周一）五台山7到10（两块场地起订）
时间：08-03 星期一 19:00-22:00
地点：易航佑成五台山体育馆
已报名：(14/18人 8男6女)
1.【4.0】十様锦 🌿
2.【2.5】向北 🌿
3.【2.0】条不过 🎀
4.【2.0】舟鱼 🎀
5.【2.5】劣质裤衩 🌿
6.【2.0】拾柒 🎀
7.【3.5】晓山青 🌿
8.【2.0】葡萄 🎀
9.【3.5】下等马 🌿
10.【2.0】元气小董 🎀
11.【2.0】爆炸芹芹子 🎀
12.【3.0】李广志 🌿
13.【3.0】荒原 🌿
14.【2.0】吃包谷粑 🌿
🙋🏻报名链接：weixin://example
  `);

  assert.equal(result.males.length, 8);
  assert.equal(result.females.length, 6);
  assert.deepEqual(result.unknown, []);
  assert.equal(result.males[0], "十様锦");
  assert.equal(result.females[0], "条不过");
});

test("识别男双和混双分组，同时按图标合并到男女名单", () => {
  const result = parseGroupedRosterText(`
男双（1号场地）
已报名：(6/6人 6男0女)
1.【3.5】哈你计各儿 🌿
2.【3.5】小罗 🌿
3.【4.0】ren 🌿
4.【3.0】菜鸟 🌿
5.【5.0】八戒 🌿
6.【4.0】yh 🌿

混双（可串场）（3.4号场地）
已报名：(4/4人 2男2女)
1.【4.5】Barry 🌿
2.【1.5】碗碗陈 🎀
3.【4.5】白切鸡代峰哥 🌿
4.【1.0】倩儿 🎀
  `);

  assert.deepEqual(result.groups, { 男双: 6, 混双: 4 });
  assert.equal(result.males.length, 8);
  assert.equal(result.females.length, 2);
  assert.deepEqual(result.unknown, []);
});

test("男双分组没有性别图标时也能推断为男生", () => {
  const result = parseGroupedRosterText("男双（1号场地）\n1.【3.5】张三\n2.【4.0】李四");
  assert.deepEqual(result.males, ["张三", "李四"]);
  assert.deepEqual(result.unknown, []);
});
