import test from "node:test";
import assert from "node:assert/strict";
import { documentToHtml, htmlToPlainText, transcriptToHtml } from "../transcriptNote.js";

test("documentToHtml escapes content and renders commitments as a table", () => {
  const html = documentToHtml({ kind: "MINUTA", content: { objective: "A <b>&</b> B", commitments: [{ text: "Hacer", owner: "Sistemas", due: "Por definir" }], sections: [{ title: "Voceo", startMs: 0, endMs: 61000, body: "x", bullets: ["y"] }] } });
  assert.match(html, /A &lt;b&gt;&amp;&lt;\/b&gt; B/);
  assert.match(html, /<table>.*<td><p>Sistemas<\/p><\/td>/);
  assert.match(html, /Voceo \(00:00–01:01\)/);
  assert.ok(htmlToPlainText(html).includes("Hacer"));
});

test("transcriptToHtml keeps timestamps and speakers", () => {
  const html = transcriptToHtml({ segments: [{ startMs: 65000, text: "Hola <x>", speakerLabel: "Ana" }] });
  assert.match(html, /<strong>01:05<\/strong> <strong>Ana:<\/strong> Hola &lt;x&gt;/);
});
