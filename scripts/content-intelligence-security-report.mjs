// Rebuild the public evidence from local Scout reports. Never includes scan help text or local paths.
import { readFile,writeFile,mkdir } from 'node:fs/promises';
import path from 'node:path';
const input=process.argv[2];
if(!input)throw Error('Usage: node scripts/content-intelligence-security-report.mjs <Scout evidence directory>');
const output=path.resolve('docs/audits/content-intelligence-stage2');
await mkdir(output,{recursive:true});
const load=async name=>JSON.parse(await readFile(path.join(input,name),'utf8'));
const before=(await load('stage2-before.sarif')).runs[0];
const after=(await load('stage2-final.sarif')).runs[0];
const api=(await load('stage2-api.sarif')).runs[0];
const sbom=await load('stage2-final.spdx.json');
const native=[
  {name:'tesseract',versionInfo:'5.5.4',licenseConcluded:'Apache-2.0',downloadLocation:'https://github.com/tesseract-ocr/tesseract/archive/7e548e6eff172f38f97664afe7f7ce40db36c8d6.tar.gz',sha:'445603ab1d0a63df552e193a600d9d5c4021aff36e144f3091af149e5efb381a'},
  {name:'poppler',versionInfo:'26.11.0',licenseConcluded:'GPL-2.0-or-later',downloadLocation:'https://poppler.freedesktop.org/poppler-26.11.0.tar.xz',sha:'41c32680160addf5a8dd7a830e4869c01e9f6bee1abb91e44fabd1ba9d7828fb'},
];
// Scout does not discover source-built native components. Explicitly retain this
// coverage gap: augmentation is an inventory, not an additional vulnerability scan.
for(const item of native) {
  const id=`SPDXRef-Source-${item.name}`;
  sbom.packages.push({...item,SPDXID:id,filesAnalyzed:false,licenseDeclared:item.licenseConcluded,copyrightText:'NOASSERTION',
    checksums:[{algorithm:'SHA256',checksumValue:item.sha}],comment:'Source-built component from pinned Dockerfile; not detected or CVE-scanned by Docker Scout.'});
  delete sbom.packages.at(-1).sha;
  const root=sbom.relationships.find(relationship=>relationship.relationshipType==='DESCRIBES')?.relatedSpdxElement;
  sbom.relationships.push({spdxElementId:root??sbom.SPDXID,relationshipType:'CONTAINS',relatedSpdxElement:id});
}
const byName=new Map(sbom.packages.map(p=>[p.name,p.versionInfo]));
const apiIds=new Set(api.results.map(r=>r.ruleId));
const rows=[];
for(const result of before.results) {
  const rule=before.tool.driver.rules[result.ruleIndex];
  const purl=result.message.text.match(/Package\s+:([^\s]+)/)?.[1]??rule.properties.purls[0];
  const plain=decodeURIComponent(purl.split('?')[0]);
  const [name,version]=plain.split('/').at(-1).split('@');
  const direct=['pillow','tesseract','poppler','python3.13'].includes(name);
  const nativeParser=['pillow','tesseract','poppler','libpng1.6','tiff','jbig2dec','openjpeg2'].includes(name);
  rows.push({cve:result.ruleId,severity:rule.properties.cvssV3_severity,package:name,installed:version,
    scannerFix:rule.properties.fixed_version,dependency:direct?'Directa':'Transitiva',kind:purl.includes(':pypi/')?'Aplicación':'SO',
    final:byName.get(name)??'Ausente bajo esta identidad',alsoInApi:apiIds.has(result.ruleId),
    exposure:nativeParser?'Parser de archivos no confiables; alcance específico del CVE por confirmar':'Runtime transitivo; explotación específica no demostrada',
    mitigation:byName.has(name)?'Actualización; límites y aislamiento adicionales':'Retiro o sustitución; comprobar componente equivalente en SBOM nativo'});
}
sbom.comment='Public inventory: supplier/originator email addresses removed; unmodified Scout evidence retained privately. Native entries are inventory additions, not scanner coverage.';
const publicSbom=JSON.stringify(sbom,null,2).replace(/<[^<>\s]+@[^<>\s]+>/g,'');
await writeFile(path.join(output,'sbom.spdx.json'),publicSbom+'\n');
await writeFile(path.join(output,'vulnerabilities.json'),JSON.stringify({beforeUnique:new Set(rows.map(r=>r.cve)).size,beforeFindings:rows.length,
  after:after.tool.driver.rules.map(rule=>({cve:rule.id,...rule.properties})),apiUnique:apiIds.size,nativeScannerCoverage:false,findings:rows},null,2)+'\n');
const columns=['CVE','Nivel','Paquete / instalada','Fix que informa Scout','Dependencia / tipo','Imagen final','También CVE en API'];
const table=rows.map(r=>`| ${r.cve} | ${r.severity} | ${r.package} ${r.installed} | ${r.scannerFix} | ${r.dependency} / ${r.kind} | ${r.final} | ${r.alsoInApi?'Sí':'No'} |`).join('\n');
await writeFile(path.join(output,'SECURITY.md'),`# Seguridad de Content Intelligence, etapa 2\n\nFecha: 2026-11-25. Scout 1.24.0, sin exclusiones. Antes: ${new Set(rows.map(r=>r.cve)).size} CVE, ${rows.length} hallazgos altos/críticos. Después: ${new Set(after.results.map(r=>r.ruleId)).size} CVE alto, cero críticos reportados. La imagen API de prueba tiene ${apiIds.size} CVE altos/críticos propios; coincidencia de CVE no prueba misma ruta de explotación. El worker se añade al ERP: no reemplaza su imagen API.\n\nEl SBOM de Scout detectó ${sbom.packages.length-native.length} paquetes y no detectó los binarios compilados Tesseract/Poppler. El SBOM adjunto añade ambos con fuente y hash, **sin afirmar que Scout los haya analizado**. La reducción no equivale a una certificación de ausencia de CVE. Modelos: hashes y commits en el Dockerfile; Apache-2.0.\n\nEl único hallazgo final es CVE-2026-107891, musl 1.2.6-r3, HIGH. Scout propone r6; el [registro oficial de Alpine](https://security.alpinelinux.org/vuln/CVE-2026-107891) identifica r3 corregido en 3.24 y r6 en edge. Se conserva el resultado bruto; no hay regla de exclusión. SQLite se retiró porque el worker no lo usa.\n\nExposición: Pillow/Poppler/Tesseract y bibliotecas de imágenes procesan entradas no confiables. No se presupone inexplotabilidad; cada hallazgo conserva versión/fix del escáner. Los demás paquetes son runtime transitivo; no se ejecutaron exploits. El JSON incluye exposición y mitigación por hallazgo. El mismo nombre ausente en Alpine puede corresponder a un componente renombrado: verificar el SBOM y los dos componentes nativos.\n\nMitigaciones verificadas por pruebas Docker: UID 10001, sin capabilities, no-new-privileges, filesystem de solo lectura, tmpfs 256 MiB, 64 PIDs, cgroups, plazos y procesos aislados; sin socket Docker ni credenciales DB/Storage. La red solo necesita API pero Compose no impone firewall de salida. No se afirma confinamiento de red completo.\n\n| ${columns.join(' | ')} |\n| ${columns.map(()=>'---').join(' | ')} |\n${table}\n`);
const auditFile=path.join(input,'stage2-npm-audit.json');
const npmAudit=await readFile(auditFile,'utf8').then(value=>JSON.parse(value.replace(/^\uFEFF/,''))).catch(()=>null);
if(npmAudit) {
  const report={scope:'Existing production npm dependency tree; Content Intelligence adds no npm dependencies',counts:npmAudit.metadata?.vulnerabilities,
    advisories:Object.values(npmAudit.advisories??{}).map(advisory=>({id:advisory.id,module:advisory.module_name,severity:advisory.severity,
      vulnerable:advisory.vulnerable_versions,patched:advisory.patched_versions,url:advisory.url,
      installed:advisory.findings.map(finding=>({version:finding.version,paths:finding.paths}))}))};
  await writeFile(path.join(output,'node-dependencies.json'),JSON.stringify(report,null,2)+'\n');
  const counts=report.counts;
  const security=await readFile(path.join(output,'SECURITY.md'),'utf8');
  await writeFile(path.join(output,'SECURITY.md'),security+`\n## Árbol npm del ERP\n\nAuditoría de producción con pnpm: ${counts.critical} crítico, ${counts.high} altos, ${counts.moderate} moderados y ${counts.low} bajos. Es una superficie separada de la imagen Python y de los CVE del sistema operativo que informa Scout. No se suman los resultados entre herramientas. [Versiones, rutas transitivas y avisos](node-dependencies.json).\n\nEsta consolidación no añadió dependencias npm. Los hallazgos requieren verificar exposición efectiva por ruta y compatibilidad antes de actualizar; no se cambiaron dependencias generales del ERP solo para reducir el contador. En particular hay avisos de tar, Fabric y otras dependencias transitivas. No se presume que estén todos expuestos por OCR ni que sean inocuos. El análisis de alcance del ERP completo y su remediación siguen pendientes y bloquean una certificación de producción.\n`);
}
console.log(JSON.stringify({beforeUnique:new Set(rows.map(r=>r.cve)).size,beforeFindings:rows.length,afterUnique:new Set(after.results.map(r=>r.ruleId)).size,apiUnique:apiIds.size}));
