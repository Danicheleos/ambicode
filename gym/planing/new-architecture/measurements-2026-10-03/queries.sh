#!/bin/bash
# Query-time and precision check on the FE snapshot (2,338 ts files): agentmap, codeindex, git grep, TS language service.
set -u
M="$(cd "$(dirname "$0")" && pwd)"
REPO=/Users/KillBill/Documents/projects/mine/ai/ambicode
BIN="$M/tools/node_modules/.bin"
LOG="$M/queries.log"; : > "$LOG"
log() { echo "$*" | tee -a "$LOG"; }
ms() { node -e 'console.log(Date.now())'; }
run() { local label="$1"; shift; local s e out code; s=$(ms); out=$("$@" 2>&1); code=$?; e=$(ms); log "[$label] $((e-s)) ms exit=$code bytes=$(printf '%s' "$out" | wc -c | tr -d ' ')"; printf '%s\n' "$out" | head -c 900 >> "$LOG"; echo >> "$LOG"; }

for r in BE FE; do
  R="$M/repos/$r"; OUT="$M/out/codeindex-$r"
  case $r in BE) SYM=PermissionHelper; FILE=utils/PermissionHelper.ts;; FE) SYM=UserFacade; FILE=state/user.facade.ts;; esac
  log "== $r symbol $SYM"
  (cd "$R" && run "git-grep-w-$r" git grep -w -l "$SYM" -- '*.ts')
  (cd "$R" && run "agentmap-find-$r" "$BIN/agentmap" --find "$SYM" --json)
  (cd "$R" && run "agentmap-relates-$r" "$BIN/agentmap" --relates "$FILE" --json)
  (cd "$R" && run "agentmap-callers-$r" "$BIN/agentmap" --callers "$SYM" --json)
  (cd "$R" && run "codeindex-find-$r" "$BIN/codeindex" find "$SYM" --repo . --out "$OUT" --concise)
  (cd "$R" && run "codeindex-refs-$r" "$BIN/codeindex" refs "$SYM" --repo . --out "$OUT")
  (cd "$R" && run "codeindex-impact-$r" "$BIN/codeindex" impact "$FILE" --repo . --out "$OUT")
  # precision: file sets from each tool vs the TypeScript language service
  (cd "$REPO" && node --input-type=module -e "
import ts from 'typescript';
import { readdirSync, readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { tsconfigFor } from './evals/scripts/src/arms/lsp-arms.mjs';
const dir='$R', SYM='$SYM', FILE='$FILE';
function walk(d,p=''){const out=[];for(const e of readdirSync(d,{withFileTypes:true})){if(e.name==='node_modules'||e.name.startsWith('.'))continue;const rel=p?p+'/'+e.name:e.name;if(e.isDirectory())out.push(...walk(path.join(d,e.name),rel));else if(e.name.endsWith('.ts'))out.push(rel);}return out;}
const files=walk(dir); const abs=f=>path.join(dir,f);
const t0=Date.now();
const host={getScriptFileNames:()=>files.map(abs),getScriptVersion:()=>'1',getScriptSnapshot:f=>ts.sys.fileExists(f)?ts.ScriptSnapshot.fromString(ts.sys.readFile(f)):undefined,getCurrentDirectory:()=>dir,getCompilationSettings:()=>ts.convertCompilerOptionsFromJson({...JSON.parse(tsconfigFor('.')).compilerOptions},dir).options,getDefaultLibFileName:o=>ts.getDefaultLibFilePath(o),fileExists:ts.sys.fileExists,readFile:ts.sys.readFile,readDirectory:ts.sys.readDirectory};
const svc=ts.createLanguageService(host);
const text=readFileSync(abs(FILE),'utf8'); const sf=ts.createSourceFile(FILE,text,ts.ScriptTarget.ES2022,true);
let pos=-1; const visit=n=>{ if(pos>=0) return; if((ts.isClassDeclaration(n)||ts.isFunctionDeclaration(n)||ts.isVariableDeclaration(n)||ts.isInterfaceDeclaration(n)||ts.isEnumDeclaration(n))&&n.name&&n.name.text===SYM){pos=n.name.getStart(sf);return;} ts.forEachChild(n,visit); }; visit(sf);
const t1=Date.now(); const refs=svc.getReferencesAtPosition(abs(FILE),pos)??[]; const t2=Date.now(); svc.getReferencesAtPosition(abs(FILE),pos); const t3=Date.now();
const tsFiles=new Set(refs.map(r=>path.relative(dir,r.fileName)).filter(f=>f!==FILE));
const grepFiles=new Set(execFileSync('git',['grep','-w','-l',SYM,'--','*.ts'],{cwd:dir}).toString().trim().split('\n').filter(f=>f&&f!==FILE));
let am=new Set(); try{const j=JSON.parse(execFileSync('$BIN/agentmap',['--relates',FILE,'--json'],{cwd:dir}).toString()); const deps=j.dependents??j.importedBy??j.relates?.dependents??[]; am=new Set((Array.isArray(deps)?deps:[]).map(d=>typeof d==='string'?d.split(' ')[0]:d.path??d.file??JSON.stringify(d)));}catch(e){am=new Set(['ERR '+String(e).slice(0,80)]);}
let ci=new Set(); try{const raw=execFileSync('$BIN/codeindex',['refs',SYM,'--repo','.','--out','$OUT'],{cwd:dir}).toString(); const j=JSON.parse(raw); const arr=Array.isArray(j)?j:(j.references??j.refs??j.results??[]); ci=new Set(arr.map(x=>x.file??x.path??x.filePath??JSON.stringify(x)).filter(f=>f!==FILE));}catch(e){ci=new Set(['ERR '+String(e).slice(0,80)]);}
const cmp=(name,set)=>{const tp=[...set].filter(f=>tsFiles.has(f)).length; return name+': files='+set.size+' truePositives='+tp+' precision='+(set.size?(tp/set.size).toFixed(2):'-')+' recall='+(tsFiles.size?(tp/tsFiles.size).toFixed(2):'-');};
console.log(JSON.stringify({repo:'$r',symbol:SYM,tsFiles:files.length,createMs:t1-t0,firstReferencesMs:t2-t1,secondReferencesMs:t3-t2,tsReferencingFiles:tsFiles.size,rssMB:Math.round(process.memoryUsage().rss/1048576)}));
console.log(cmp('git grep -w',grepFiles)); console.log(cmp('agentmap --relates dependents',am)); console.log(cmp('codeindex refs',ci));
console.log('ts refs sample:',[...tsFiles].slice(0,5).join(', '));
" 2>&1 | tee -a "$LOG")
done
log "== done"
