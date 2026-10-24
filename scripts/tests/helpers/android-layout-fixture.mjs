import { fileURLToPath } from 'node:url'
import { build, normalizePath } from '../../../apps/desktop/node_modules/vite/dist/node/index.js'
import tailwindcss from '../../../apps/desktop/node_modules/@tailwindcss/vite/dist/index.mjs'

export async function buildAndroidLayoutFixture() {
  const root = fileURLToPath(new URL('../../../apps/desktop/', import.meta.url))
  const source = relative => JSON.stringify(normalizePath(fileURLToPath(new URL(relative, import.meta.url))))
  const ui = '../../../packages/ui/src/'
  const chat = '../../../apps/desktop/src/modules/runly.chat/'
  const fixture = `
    import ${source('../../../apps/desktop/src/styles.css')};
    import React, {useState} from 'react';
    import {createRoot} from 'react-dom/client';
    import {QueryClient, QueryClientProvider} from '@tanstack/react-query';
    import {ChatAttachMenu} from ${source(ui + 'components/ChatAttachMenu.jsx')};
    import {useSafeAreaInsets} from ${source(ui + 'hooks/useSafeAreaInsets.js')};
    import {useKeyboardViewport} from ${source(ui + 'hooks/useKeyboardInset.js')};
    import {ModuleSidebar} from ${source(ui + 'components/ModuleSidebar.jsx')};
    import {getShellViewportStyle} from ${source('../../../apps/desktop/src/app/shellViewport.js')};
    import {noteToolbarPlacement} from ${source('../../../apps/desktop/src/modules/runly.notes/lib/noteToolbarPlacement.js')};
    import {floatingChatBounds,miniChatViewportStyle} from ${source(chat + 'lib/floatingChatLayout.js')};
    import {AttachmentsBlock} from ${source(chat + 'components/MessageAttachments.jsx')};
    import {SubpagesStrip} from ${source('../../../apps/desktop/src/modules/runly.notes/components/SubpagesStrip.jsx')};
    window.picked=[];window.opened=[];
    const photo='data:image/svg+xml,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="300" height="400"><rect width="300" height="400" fill="teal"/></svg>');
    function App(){
      const safeArea=useSafeAreaInsets();const keyboard=useKeyboardViewport();
      const placement=noteToolbarPlacement({coarse:true,viewing:false,keyboard});
      const bubble=floatingChatBounds({height:innerHeight,safeArea,keyboard,y:9999});
      const [count,setCount]=useState(2);
      window.setImageCount=setCount;
      const pick=files=>window.picked.push(files.map(f=>f.name));
      return <>
        <div className="app-shell-root fixture-shell" data-shell-footer={keyboard.open?'false':'true'} style={getShellViewportStyle(keyboard)}>
          <div id="sidebar-probe"><ModuleSidebar module={{key:'test',name:'Notas',color:'#444444',navigation:[]}} collapsed mobileOpen/></div>
          <div className="fixture-body"><header>
            <span>Nota de prueba</span><SubpagesStrip note={{id:'test',title:'Proyecto'}} canCreate onCreate={()=>window.opened.push('new')} onOpenNote={id=>window.opened.push(id)}/>
          </header><main>
            <ChatAttachMenu trigger={<button id="attach">Adjuntar</button>} imageAccept="image/*,video/*" documentAccept="*/*" onPickImages={pick} onPickDocuments={pick} onPickCamera={file=>pick([file])}/>
            <div id="media"><AttachmentsBlock attachments={Array.from({length:count},(_,i)=>({id:'photo-'+i,fileName:'Imagen '+i,mimeType:'image/png',url:photo}))} onOpen={(_,index)=>window.opened.push(index)}/></div>
          </main>{!keyboard.open&&<footer id="brand">Runly ERP · Consejos · Hecho por Racoon Devs</footer>}</div>
          <div id="format" style={{bottom:placement.barBottom}}>Formato</div>
        </div>
        <div id="mini" style={miniChatViewportStyle(keyboard)}>Chat</div>
        <div id="bubble" style={{top:bubble.y}}>Chat</div>
        <div id="android"/>
      </>
    }
    const host=document.createElement('div');host.id='android-layout-fixture';document.body.appendChild(host);
    createRoot(host).render(<QueryClientProvider client={new QueryClient()}><App/></QueryClientProvider>);
  `
  const uiExports = `
    export * from ${source(ui + 'components/Button.jsx')};
    export * from ${source(ui + 'components/EmptyState.jsx')};
    export * from ${source(ui + 'components/ErrorState.jsx')};
    export * from ${source(ui + 'components/Skeleton.jsx')};
    export * from ${source(ui + 'components/Sheet.jsx')};
    export * from ${source(ui + 'components/ConfirmDialog.jsx')};
    export * from ${source(ui + 'components/ContextMenu.jsx')};
    export * from ${source(ui + 'components/Popover.jsx')};
    export * from ${source(ui + 'hooks/usePointerCapabilities.js')};
    export * from ${source(ui + 'components/office-actions-context.js')};
    export {cn} from ${source(ui + 'lib/utils.js')};
    export {IconGlyph} from ${source(ui + 'components/IconGlyph.jsx')};
    export {isKnownIcon} from ${source(ui + 'lib/icon-library/index.js')};
  `
  const mocks = {
    '\0fixture-auth': 'export const useAuth=()=>({session:null});',
    '\0fixture-runly': 'export const runly={};',
    '\0fixture-subpages': "export const useSubpages=()=>({children:[{id:'child',title:'Ideas',icon:'FileText'}],isLoading:false,isError:false});",
    '\0fixture-reactions': 'export const MessageReactionPicker=()=>null;',
  }
  const result = await build({ root, configFile: false, logLevel: 'silent',
    resolve: { dedupe: ['react', 'react-dom', '@tanstack/react-query'] },
    define: { 'process.env.NODE_ENV': JSON.stringify('production') },
    esbuild: { jsx: 'automatic' },
    plugins: [tailwindcss(), { name: 'android-layout-fixture', enforce: 'pre',
      resolveId(id) {
        if (id === 'android-layout-fixture' || normalizePath(id).endsWith('/android-layout-fixture')) return '\0android-layout-fixture.jsx'
        if (id === '@runly/ui') return '\0fixture-ui'
        if (id.includes('auth/AuthProvider')) return '\0fixture-auth'
        if (id.endsWith('/lib/runly')) return '\0fixture-runly'
        if (id.endsWith('/hooks/useSubpages.js')) return '\0fixture-subpages'
        if (id === './MessageReactionPicker') return '\0fixture-reactions'
      },
      load(id) {
        if (id === '\0android-layout-fixture.jsx') return fixture
        if (id === '\0fixture-ui') return uiExports
        return mocks[id]
      },
    }],
    build: { write: false, minify: false,
      lib: { entry: 'android-layout-fixture', formats: ['iife'], name: 'AndroidLayoutFixture' } },
  })
  const output = Array.isArray(result) ? result[0].output : result.output
  return { code: output.find(chunk => chunk.type === 'chunk').code,
    css: output.filter(chunk => chunk.type === 'asset' && chunk.fileName.endsWith('.css')).map(chunk => chunk.source).join('\n') }
}

export const fixtureCSS = `
  *{box-sizing:border-box}body{margin:0}button{font:inherit;cursor:pointer}
  .fixture-shell{position:fixed;inset:0;height:100dvh;overflow:hidden;background:hsl(var(--background))}
  .fixture-body{height:100%;display:flex;flex-direction:column;padding-top:calc(56px + var(--sat))}
  header{display:flex;align-items:center;justify-content:space-between;height:48px;flex-shrink:0;padding:0 16px;border-bottom:1px solid hsl(var(--border))}
  main{flex:1;min-height:0;overflow:auto;padding:16px}#brand{height:48px;flex-shrink:0;display:flex;align-items:center;padding:0 16px}
  #format{position:fixed;left:0;right:0;height:48px;background:hsl(var(--card));border-block:1px solid hsl(var(--border))}
  #mini{position:fixed;right:80px;width:300px;height:380px;background:hsl(var(--card));border:1px solid hsl(var(--border))}
  #bubble{position:fixed;right:16px;width:56px;height:56px;border-radius:50%;background:hsl(var(--muted))}
  #android{position:fixed;bottom:0;width:100%;height:var(--sab);background:gray;pointer-events:none}
  #media{width:352px;max-width:100%}
  #sidebar-probe{position:absolute;pointer-events:none;opacity:0;top:calc(56px + var(--sat));height:calc(var(--shell-viewport-height) - 56px - var(--sat) - var(--shell-bottom-inset))}
`
