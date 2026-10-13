import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Button, RunlyTable, AtlasTable, RunlyForm, AtlasForm, RunlyDetail, AtlasDetail,
  RunlyCrudView, AtlasCrudView, RunlyCardView, AtlasCardView } from '@runly/ui';
import { Button as AliasButton } from '@atlas/ui';
import { PreviewHost, createRuntimeSession, PREVIEW_RUNTIME_CONTRACT } from '@runly/preview-runtime';
import { validateModuleDefinition } from '@runly/module-compiler/browser';
import '@runly/ui/theme.css';
import '@runly/ui/runtime.css';

if (Button !== AliasButton || [[RunlyTable, AtlasTable], [RunlyForm, AtlasForm], [RunlyDetail, AtlasDetail],
  [RunlyCrudView, AtlasCrudView], [RunlyCardView, AtlasCardView]].some(([current, legacy]) => current !== legacy)) throw new Error('UI alias identity mismatch');
if (typeof validateModuleDefinition !== 'function' || PREVIEW_RUNTIME_CONTRACT.schemaVersion !== 3) throw new Error('Browser export contract mismatch');
const session = createRuntimeSession({ id: 'browser-contract',
  transport: { fetch: async () => Response.json({ data: [] }) },
  preferences: { get: async () => null, set: async () => null, remove: async () => null },
  resources: { resolve: () => null } });
const blueprint = { key: 'custom.consumer.dashboard', kind: 'DASHBOARD', schema: { title: 'Prueba externa', widgets: [] } };
function App() {
  const [count, setCount] = useState(0);
  return <><Button onClick={() => setCount(count + 1)}>Probar componente</Button><p data-testid="count">{count}</p>
    <PreviewHost session={session} blueprints={[blueprint]} selection={{}} kind="DASHBOARD" blueprint={blueprint} />
  </>;
}
createRoot(document.getElementById('root')).render(<App />);
window.contractReady = true;
window.disposeContract = () => session.dispose();
