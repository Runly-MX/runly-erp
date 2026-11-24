import fs from 'node:fs'; const dist=process.argv[2]; const man=JSON.parse(fs.readFileSync(dist+'/.vite/manifest.json','utf8'));
const byFile=Object.fromEntries(Object.entries(man).map(([k,v])=>[v.file,k]));
const start=Object.keys(man).find(k=>/AppEntry\.jsx$/.test(k));
const parent={[start]:null}; const q=[start];
while(q.length){const k=q.shift();for(const i of man[k].imports||[]){if(!(i in parent)){parent[i]=k;q.push(i);}}}
const targets=process.argv.slice(3);
for(const t of targets){const k=Object.keys(parent).find(x=>man[x].file.includes(t)); if(!k){console.log(t,'NOT in static closure');continue;}
 const p=[];let c=k;while(c){p.unshift(man[c].file.replace('assets/','')+(man[c].src?` [${man[c].src.split('/').slice(-2).join('/')}]`:''));c=parent[c];} console.log(t,'<=',p.join('\n   <= '));}
