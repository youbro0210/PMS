const ts=require('./node_modules/typescript');const fs=require('fs');
const files=['components/layout/FloatingLogout.tsx','app/layout.tsx'];
let bad=0;for(const f of files){const s=fs.readFileSync(f,'utf8');const sf=ts.createSourceFile(f,s,ts.ScriptTarget.Latest,true,f.endsWith('tsx')?ts.ScriptKind.TSX:ts.ScriptKind.TS);const d=sf.parseDiagnostics||[];if(d.length){bad++;console.log('ERR',f);d.forEach(x=>console.log(' ',ts.flattenDiagnosticMessageText(x.messageText,'\n')))}else console.log('OK',f)}process.exit(bad?1:0);
