import test from "node:test";
import assert from "node:assert/strict";
import * as Y from "yjs";
import { parseAppendText, blocksToHtml, blocksToPlainText, appendBlocksToYDoc } from "../append-blocks.js";

const SAMPLE = "# Titulo\n\nParrafo <uno>\n- a\n* b\n- [ ] tarea\n- [x] hecha\n\n### Sub\n## Medio";

test("parseAppendText: headings, grouping, tasks and paragraphs", () => {
  const blocks = parseAppendText(SAMPLE);
  assert.deepEqual(blocks, [
    { type: "heading", level: 1, text: "Titulo" },
    { type: "paragraph", text: "Parrafo <uno>" },
    { type: "bulletList", items: [{ text: "a" }, { text: "b" }] },
    { type: "taskList", items: [{ text: "tarea", checked: false }, { text: "hecha", checked: true }] },
    { type: "heading", level: 3, text: "Sub" },
    { type: "heading", level: 2, text: "Medio" },
  ]);
});

test("parseAppendText: blank input yields nothing; #### is a paragraph", () => {
  assert.deepEqual(parseAppendText("  \n\n"), []);
  assert.equal(parseAppendText("#### x")[0].type, "paragraph");
});

test("blocksToHtml: editor-like markup with escaping", () => {
  const html = blocksToHtml(parseAppendText("## H\nA & <b>\n- x\n- [x] t"));
  assert.equal(
    html,
    '<h2>H</h2><p>A &amp; &lt;b&gt;</p><ul><li><p>x</p></li></ul>' +
      '<ul data-type="taskList"><li data-checked="true" data-type="taskItem"><label><input type="checkbox" checked="checked"><span></span></label><div><p>t</p></div></li></ul>',
  );
});

test("blocksToPlainText: one line per block/item", () => {
  assert.equal(blocksToPlainText(parseAppendText("# A\n- b\n- c\nd")), "A\nb\nc\nd");
});

test("appendBlocksToYDoc: expected structure, appended after existing nodes, converges", () => {
  const base = new Y.Doc();
  const frag = base.getXmlFragment("default");
  const p = new Y.XmlElement("paragraph");
  const t = new Y.XmlText();
  t.insert(0, "previo");
  p.insert(0, [t]);
  frag.insert(0, [p]);

  const other = new Y.Doc();
  Y.applyUpdate(other, Y.encodeStateAsUpdate(base));
  const before = Y.encodeStateVector(other);
  appendBlocksToYDoc(other, parseAppendText("# H\n- b\n- [x] t\ntexto"));
  const update = Y.encodeStateAsUpdate(other, before);

  Y.applyUpdate(base, update);
  const out = base.getXmlFragment("default");
  assert.equal(out.length, 5);
  assert.equal(out.get(0).nodeName, "paragraph");
  const heading = out.get(1);
  assert.equal(heading.nodeName, "heading");
  assert.strictEqual(heading.getAttribute("level"), 1);
  assert.equal(out.get(2).nodeName, "bulletList");
  assert.equal(out.get(2).get(0).nodeName, "listItem");
  assert.equal(out.get(2).get(0).get(0).nodeName, "paragraph");
  const task = out.get(3).get(0);
  assert.equal(out.get(3).nodeName, "taskList");
  assert.equal(task.nodeName, "taskItem");
  assert.strictEqual(task.getAttribute("checked"), true);
  assert.equal(base.getXmlFragment("default").toString(), other.getXmlFragment("default").toString());
  assert.match(out.toString(), /<heading level="1">H<\/heading>/);
});
