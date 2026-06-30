const ts=require('./node_modules/typescript');const fs=require('fs');
const f='components/accounting/AccountingView.tsx';
const s=fs.readFileSync(f,'utf8');const sf=ts.createSourceFile(f,s,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);const d=sf.parseDiagnostics||[];
if(d.length){console.log('ERR');d.forEach(x=>console.log(' ',ts.flattenDiagnosticMessageText(x.messageText,'\n')));process.exit(1)}else console.log('OK '+f);
