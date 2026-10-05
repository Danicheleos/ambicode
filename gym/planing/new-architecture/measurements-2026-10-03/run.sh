#!/bin/bash
# Measures cold index time of off-the-shelf code-index tools on three repos:
# self (this plugin, 159 ts files), BE snapshot (532 ts), FE snapshot (2,338 ts; 4,262 files).
set -u
M="$(cd "$(dirname "$0")" && pwd)"
REPO=/Users/KillBill/Documents/projects/mine/ai/ambicode
LOG="$M/results.log"
: > "$LOG"
log() { echo "$*" | tee -a "$LOG"; }
tm() { # tm <label> <cmd...> : wall time in ms, exit code, output head
  local label="$1"; shift
  local start end ms out code
  start=$(node -e 'console.log(Date.now())')
  out=$("$@" 2>&1); code=$?
  end=$(node -e 'console.log(Date.now())')
  ms=$((end-start))
  log "[$label] ${ms} ms exit=$code"
  printf '%s\n' "$out" | head -c 1500 >> "$LOG"; echo >> "$LOG"
}

log "== setup $(date -u +%FT%TZ) node $(node --version)"
mkdir -p "$M/repos" "$M/tools"
if [ ! -d "$M/repos/FE" ]; then cp -R "$REPO/benchmarks/FE/src" "$M/repos/FE"; fi
if [ ! -d "$M/repos/BE" ]; then cp -R "$REPO/benchmarks/BE/src" "$M/repos/BE"; fi
if [ ! -d "$M/repos/self" ]; then mkdir -p "$M/repos/self"; (cd "$REPO" && git archive HEAD) | tar -x -C "$M/repos/self"; ln -s "$REPO/node_modules" "$M/repos/self/node_modules"; fi
for r in FE BE; do (cd "$M/repos/$r" && git init -q 2>/dev/null; git add -A >/dev/null 2>&1; git -c user.email=a@b -c user.name=m commit -qm snap >/dev/null 2>&1); done
(cd "$M/repos/self" && git init -q 2>/dev/null; git add -A >/dev/null 2>&1; git -c user.email=a@b -c user.name=m commit -qm snap >/dev/null 2>&1)
# tsconfig for the snapshots, same shape the eval's LSP arm uses
node --input-type=module -e "
import { tsconfigFor } from '$REPO/evals/scripts/src/arms/lsp-arms.mjs';
import { writeFileSync } from 'node:fs';
for (const r of ['FE','BE']) writeFileSync('$M/repos/'+r+'/tsconfig.json', tsconfigFor('.'));
" && log "tsconfig written for FE, BE"
for r in self BE FE; do log "$r: $(find "$M/repos/$r" -name '*.ts' -not -path '*/node_modules/*' | wc -l | tr -d ' ') ts files, $(du -sh "$M/repos/$r" 2>/dev/null | cut -f1)"; done

log "== install tools"
tm "npm-install" npm i --prefix "$M/tools" --no-audit --no-fund --loglevel=error @maxgfr/codeindex @raymondchins/agentmap @sourcegraph/scip-typescript
BIN="$M/tools/node_modules/.bin"
ls "$BIN" | tee -a "$LOG"

log "== help texts"
tm "codeindex-help" "$BIN/codeindex" --help
tm "agentmap-help" "$BIN/agentmap" --help
tm "scip-ts-help" "$BIN/scip-typescript" --help

for r in self BE FE; do
  R="$M/repos/$r"
  log "== repo $r"
  (cd "$R" && tm "codeindex-index-cold-$r" "$BIN/codeindex" index --out "$M/out/codeindex-$r")
  (cd "$R" && tm "codeindex-index-warm-$r" "$BIN/codeindex" index --out "$M/out/codeindex-$r")
  (cd "$R" && tm "codeindex-outline-$r" "$BIN/codeindex" outline --out "$M/out/codeindex-$r" 2>/dev/null || true)
  du -sh "$M/out/codeindex-$r" 2>/dev/null | tee -a "$LOG"
  (cd "$R" && tm "agentmap-map-cold-$r" "$BIN/agentmap" --map --tokens 2000)
  (cd "$R" && tm "agentmap-map-warm-$r" "$BIN/agentmap" --map --tokens 2000)
  (cd "$R" && tm "agentmap-hubs-$r" "$BIN/agentmap" --hubs --json)
  (cd "$R" && tm "scip-ts-index-$r" "$BIN/scip-typescript" index --infer-tsconfig --output "$M/out/index-$r.scip")
  ls -la "$M/out/index-$r.scip" 2>/dev/null | tee -a "$LOG"
done

log "== typescript language service warm-up (the cost LSP pays), self/BE/FE"
node --input-type=module -e "
import ts from '$REPO/node_modules/typescript/lib/typescript.js';
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { tsconfigFor } from '$REPO/evals/scripts/src/arms/lsp-arms.mjs';
function walk(d, p='') { const out=[]; for (const e of readdirSync(d,{withFileTypes:true})) { if (e.name==='node_modules'||e.name.startsWith('.')) continue; const rel=p?p+'/'+e.name:e.name; if (e.isDirectory()) out.push(...walk(path.join(d,e.name),rel)); else if (e.name.endsWith('.ts')) out.push(rel);} return out; }
for (const r of ['self','BE','FE']) {
  const dir='$M/repos/'+r; const files=walk(dir); const abs=f=>path.join(dir,f);
  const t0=Date.now();
  const host={getScriptFileNames:()=>files.map(abs),getScriptVersion:()=>'1',getScriptSnapshot:f=>ts.sys.fileExists(f)?ts.ScriptSnapshot.fromString(ts.sys.readFile(f)):undefined,getCurrentDirectory:()=>dir,getCompilationSettings:()=>ts.convertCompilerOptionsFromJson({...JSON.parse(tsconfigFor('.')).compilerOptions},dir).options,getDefaultLibFileName:o=>ts.getDefaultLibFilePath(o),fileExists:ts.sys.fileExists,readFile:ts.sys.readFile,readDirectory:ts.sys.readDirectory};
  const svc=ts.createLanguageService(host);
  // pick the first exported function declaration we can find
  let target=null;
  for (const f of files) { const text=readFileSync(abs(f),'utf8'); const sf=ts.createSourceFile(f,text,ts.ScriptTarget.ES2022,true); for (const n of sf.statements) { if (ts.isFunctionDeclaration(n)&&n.name&&(ts.getCombinedModifierFlags(n)&ts.ModifierFlags.Export)) { target={file:f,pos:n.name.getStart(sf),name:n.name.text}; break; } } if (target) break; }
  const t1=Date.now();
  const refs1=svc.getReferencesAtPosition(abs(target.file),target.pos)??[];
  const t2=Date.now();
  const refs2=svc.getReferencesAtPosition(abs(target.file),target.pos)??[];
  const t3=Date.now();
  const ws=svc.getNavigateToItems(target.name, 50);
  const t4=Date.now();
  console.log(JSON.stringify({repo:r,files:files.length,symbol:target.name,createMs:t1-t0,firstReferencesMs:t2-t1,refs:refs1.length,secondReferencesMs:t3-t2,refs2:refs2.length,navigateToMs:t4-t3,rssMB:Math.round(process.memoryUsage().rss/1048576)}));
}
" 2>&1 | tee -a "$LOG"
log "== done $(date -u +%FT%TZ)"
