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

test("parseAppendText: markdown image lines become image blocks", () => {
  const blocks = parseAppendText("hola\n![Foto 1](https://example.com/a.png?x=1)\n![](https://example.com/b.jpg)");
  assert.deepEqual(blocks.slice(1), [
    { type: "image", url: "https://example.com/a.png?x=1", alt: "Foto 1" },
    { type: "image", url: "https://example.com/b.jpg", alt: "" },
  ]);
});

test("image block: html mirrors the editor node and the Y.Doc append converges", () => {
  const blocks = [
    { type: "image", src: "https://f.example/a.png", alt: 'dice "hi"', width: 60, aspectRatio: 2 },
    { type: "image", url: "https://x.example/unresolved.png", alt: "sin src" },
  ];
  assert.equal(blocksToHtml(blocks), '<img src="https://f.example/a.png" alt="dice &quot;hi&quot;" data-width="60" data-aspect-ratio="2">');
  assert.equal(blocksToPlainText(blocks), 'dice "hi"\nsin src');
  const a = new Y.Doc();
  appendBlocksToYDoc(a, blocks);
  const frag = a.getXmlFragment("default");
  assert.equal(frag.length, 1);
  const node = frag.get(0);
  assert.equal(node.nodeName, "image");
  assert.equal(node.getAttribute("src"), "https://f.example/a.png");
  assert.equal(node.getAttribute("width"), 60);
  assert.equal(node.getAttribute("aspectRatio"), 2);
  assert.equal(node.getAttribute("annotations"), "[]");
  const b = new Y.Doc();
  Y.applyUpdate(b, Y.encodeStateAsUpdate(a));
  assert.equal(b.getXmlFragment("default").get(0).getAttribute("src"), "https://f.example/a.png");
});
