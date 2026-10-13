import { Schema, DOMSerializer } from '@tiptap/pm/model';
import { EditorState } from '@tiptap/pm/state';
import { EditorView } from '@tiptap/pm/view';
import { Editor, mergeAttributes } from '@tiptap/core';
import * as Y from 'yjs';
import { Awareness } from 'y-protocols/awareness';
import { createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import { EditorContent } from '@tiptap/react';
import { buildExtensions } from '../../../apps/desktop/src/modules/runly.notes/lib/editor-extensions.js';

window.runClipboardFixture = () => {
  const schema = new Schema({
    nodes: {
      doc: { content: 'block+' },
      paragraph: { group: 'block', content: 'inline*', parseDOM: [{ tag: 'p' }], toDOM: () => ['p', 0] },
      wrapper: { group: 'block', content: 'block+', attrs: { label: { default: 'safe', validate: 'string' } },
        parseDOM: [{ tag: 'blockquote' }], toDOM: node => ['blockquote', { 'data-label': node.attrs.label }, 0] },
      text: { group: 'inline' },
    },
    marks: { strong: { parseDOM: [{ tag: 'strong' }], toDOM: () => ['strong', 0] } },
  });
  const labels = json => {
    const result = [];
    const visit = node => { if (node?.type === 'wrapper') result.push(node.attrs.label); node?.content?.forEach(visit); };
    json?.content?.forEach(visit);
    return result;
  };
  const paste = html => {
    const mount = document.createElement('div'); document.body.appendChild(mount);
    let captured;
    const view = new EditorView(mount, { state: EditorState.create({ schema }),
      handlePaste: (_view, _event, slice) => { captured = slice.toJSON(); return false; },
      dispatchTransaction: transaction => view.updateState(view.state.apply(transaction)),
    });
    try {
      view.pasteHTML(html);
      return { captured: labels(captured), doc: view.state.doc.toJSON(), text: view.state.doc.textContent };
    } finally { view.destroy(); mount.remove(); }
  };
  const contextHtml = label => {
    const paragraph = document.createElement('p');
    paragraph.setAttribute('data-pm-slice', `0 0 ${JSON.stringify(['wrapper', { label }])}`);
    paragraph.textContent = 'Fixture';
    return paragraph.outerHTML;
  };
  const invalid = [['span', 'fixture'], { fixture: true }, null, 23].map(value => paste(contextHtml(value)));
  const valid = paste(contextHtml('valid context'));
  const ordinary = paste('<p>Hola <strong>Runly</strong></p>');
  const mount = document.createElement('div'); document.body.appendChild(mount);
  const view = new EditorView(mount, { state: EditorState.create({ schema }) });
  try {
    view.pasteText('Edicion');
    view.dispatch(view.state.tr.insertText('!', view.state.doc.content.size - 1));
    const json = view.state.doc.toJSON();
    const restored = schema.nodeFromJSON(json);
    restored.check();
    return { invalid, valid, ordinary, edit: { text: restored.textContent, roundtrip: JSON.stringify(restored.toJSON()) === JSON.stringify(json) } };
  } finally { view.destroy(); mount.remove(); }
};

window.runNotesEditorFixture = () => {
  const mount = document.createElement('div'); document.body.appendChild(mount);
  // The read-only extension configuration excludes remote slash-command actions;
  // the fixture itself is editable to exercise local schema/table/history APIs.
  const editor = new Editor({ element: mount, extensions: buildExtensions({ readOnly: true }), content: '<p>Notas <strong>Runly</strong></p>' });
  try {
    editor.view.pasteHTML('<p>Pegado normal</p>');
    const pasted = editor.getText().includes('Pegado normal');
    editor.commands.setContent('<p>Notas <strong>Runly</strong></p>');
    const formatted = editor.getHTML().includes('<strong>Runly</strong>');
    editor.commands.insertTable({ rows: 2, cols: 2, withHeaderRow: true });
    const hasTable = () => JSON.stringify(editor.getJSON()).includes('"type":"table"');
    const tableInserted = hasTable();
    editor.commands.undo(); const undoRemovedTable = !hasTable();
    editor.commands.redo(); const redoRestoredTable = hasTable();
    const json = editor.getJSON();
    editor.state.schema.nodeFromJSON(json).check();
    editor.commands.setContent(json);
    return { pasted, formatted, tableInserted, undoRemovedTable, redoRestoredTable, roundtrip: JSON.stringify(editor.getJSON()) === JSON.stringify(json) };
  } finally { editor.destroy(); mount.remove(); }
};

window.runMergedAttributesFixture = () => {
  const attrs = mergeAttributes({ title: 'safe' }, JSON.parse('{"__proto__":{"onerror":"void 0","data-fixture":"unexpected"}}'));
  const { dom } = DOMSerializer.renderSpec(document, ['span', attrs]);
  return { title: dom.getAttribute('title'), inheritedEvent: dom.hasAttribute('onerror'), inheritedCanary: dom.hasAttribute('data-fixture'), ordinaryPrototype: Object.getPrototypeOf(attrs) === Object.prototype };
};

window.runReactEditorFixture = async () => {
  const mount = document.createElement('div'); document.body.appendChild(mount);
  const editor = new Editor({ extensions: buildExtensions({ readOnly: true }), content: '<p>React Runly</p>' });
  const root = createRoot(mount);
  try {
    flushSync(() => root.render(createElement(EditorContent, { editor })));
    const mounted = mount.querySelector('.ProseMirror')?.textContent.includes('React Runly') === true;
    editor.commands.insertContent('Fixture ');
    await new Promise(resolve => setTimeout(resolve, 0));
    return { mounted, edited: mount.querySelector('.ProseMirror')?.textContent.includes('Fixture') === true };
  } finally { root.unmount(); editor.destroy(); mount.remove(); }
};

window.runNotesCollabFixture = async () => {
  const a = new Y.Doc(), b = new Y.Doc();
  a.on('update', (update, origin) => { if (origin !== 'fixture-remote') Y.applyUpdate(b, update, 'fixture-remote'); });
  b.on('update', (update, origin) => { if (origin !== 'fixture-remote') Y.applyUpdate(a, update, 'fixture-remote'); });
  const awarenessA = new Awareness(a), awarenessB = new Awareness(b);
  const mounts = [document.createElement('div'), document.createElement('div')];
  mounts.forEach(mount => document.body.appendChild(mount));
  const editors = [];
  try {
    for (const [index, ydoc, awareness] of [[0, a, awarenessA], [1, b, awarenessB]]) {
      editors.push(new Editor({ element: mounts[index], extensions: buildExtensions({ readOnly: true, ydoc, provider: { awareness }, userName: `Fixture ${index}`, userColor: '#123456' }) }));
    }
    const [first, second] = editors;
    first.commands.setContent('<p>Desde A</p>');
    const aToB = second.getText() === first.getText() && second.getText().includes('Desde A');
    first.commands.undo();
    const undoSynced = first.getText() === second.getText() && !first.getText().includes('Desde A');
    first.commands.redo();
    const redoSynced = first.getText() === second.getText() && first.getText().includes('Desde A');
    second.view.pasteText(' +B');
    const bToA = first.getText() === second.getText() && first.getText().includes('+B');
    first.state.schema.nodeFromJSON(first.getJSON()).check();
    second.state.schema.nodeFromJSON(second.getJSON()).check();
    return { aToB, bToA, undoSynced, redoSynced, roundtrip: JSON.stringify(first.getJSON()) === JSON.stringify(second.getJSON()) };
  } finally {
    editors.forEach(editor => editor.destroy());
    awarenessA.destroy(); awarenessB.destroy(); a.destroy(); b.destroy();
    mounts.forEach(mount => mount.remove());
  }
};
