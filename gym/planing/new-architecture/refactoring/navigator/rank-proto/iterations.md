# Ranking iterations (dev = 6141, 5967, 6292, 5948, 3571, 6086; mean recall of reachable truth; fcov = share of truth under top-5 deduped folders)

| # | hypothesis | dev @25 | dev @50 | dev @100 | fcov | decision |
|---|---|---|---|---|---|---|
| 0a | old design: file-level path idf (no dir df) | 0.113 | 0.149 | 0.232 | 0.135 | reference |
| 0b | H1 base: dir-name df for dirs + file-name df for names, drop words in no path | 0.109 | 0.162 | 0.195 | 0.135 | start |
| 1 | ticket word frequency weights (1+ln count) | 0.149 | 0.182 | 0.232 | 0.146 | KEPT (d@50 +0.020; without 6141 +0.024) . Universal because: a term repeated in a ticket is its subject in any language or repo; pure ticket statistic |
| 2 | adjacent-word joins on both sides (score card <-> score-card/scorecard) | 0.152 | 0.198 | 0.272 | 0.149 | KEPT (d@50 +0.015; without 6141 +0.047) . Universal because: identifier naming (kebab, camel, snake, concatenated) varies in every ecosystem; joins are generated from the repo and ticket text, no list |
| 3 | drop dir-name words present in >5% of directories | 0.152 | 0.198 | 0.272 | 0.149 | rejected (d@50 +0.000; without 6141 +0.000)  |
| 4 | same cut at 10% of directories | 0.152 | 0.198 | 0.272 | 0.149 | rejected (d@50 +0.000; without 6141 +0.000)  |
| 5 | same cut at 2% of directories | 0.166 | 0.232 | 0.285 | 0.227 | KEPT (d@50 +0.034; without 6141 +0.017)  |
| 6 | drop file-name words present in >5% of files | 0.084 | 0.134 | 0.158 | 0.169 | rejected (d@50 -0.098; without 6141 -0.093)  |
| 7 | import hop: neighbours (imports and importers) of the top 25 files | 0.195 | 0.261 | 0.327 | 0.261 | KEPT (d@50 +0.029; without 6141 +0.034) . Universal because: shared code that a feature uses carries no ticket word in any language that has imports; the resolver is the existing language-neutral one |
| 8 | folder stage: folders ranked by coverage (share of files carrying each ticket word, any path word) x log2(1+size); boost top 8 deduped folders | 0.190 | 0.211 | 0.267 | 0.345 | rejected (d@50 -0.050; without 6141 -0.056)  |
| 9 | folder boost flat instead of 1/(1+rank) | 0.195 | 0.261 | 0.327 | 0.261 | rejected (d@50 +0.000; without 6141 +0.000)  |
| 10 | folder boost weight beta 1.5 | 0.195 | 0.261 | 0.327 | 0.261 | rejected (d@50 +0.000; without 6141 +0.000)  |
| 11 | top 15 folders | 0.195 | 0.261 | 0.327 | 0.261 | rejected (d@50 +0.000; without 6141 +0.000)  |
| 12 | folder size exponent fLog 2 (prefer larger folders) | 0.195 | 0.261 | 0.327 | 0.261 | rejected (d@50 +0.000; without 6141 +0.000)  |
| 13 | title words x2 | 0.176 | 0.258 | 0.373 | 0.299 | rejected (d@50 -0.003; without 6141 -0.004)  |
| 14 | sibling files (same dir and stem) of top 25 | 0.195 | 0.261 | 0.327 | 0.261 | rejected (d@50 +0.000; without 6141 +0.000)  |
| 15 | hop from top 60 | 0.195 | 0.261 | 0.327 | 0.261 | rejected (d@50 +0.000; without 6141 +0.000)  |

Final config: {"tf":1,"joins":1,"bigrams":1,"dirShare":0.02,"hop":0.5,"hopTop":25}

## Part 2 (start = final config of part 1; gains from tf, joins, share cut, hop)
| # | hypothesis | dev @25 | dev @50 | dev @100 | fcov | decision |
|---|---|---|---|---|---|---|
| 0a | old design: file-level path idf (no dir df) | 0.113 | 0.149 | 0.232 | 0.135 | reference |
| 0b | H1 base: dir-name df for dirs + file-name df for names, drop words in no path | 0.195 | 0.261 | 0.327 | 0.261 | start |
| 16 | folder stage as tie-break only: coverage folders, beta 0.1 | 0.194 | 0.287 | 0.327 | 0.345 | KEPT (d@50 +0.026; without 6141 +0.035) . Universal because: folders named for a feature make all their files carry its word, in any layout; weight small so own evidence dominates |
| 17 | folder beta 0.25 | 0.223 | 0.283 | 0.335 | 0.345 | rejected (d@50 -0.003; without 6141 -0.004)  |
| 18 | top 15 folders | 0.194 | 0.287 | 0.324 | 0.345 | rejected (d@50 +0.000; without 6141 +0.000)  |
| 19 | folder size exponent 2 | 0.184 | 0.297 | 0.324 | 0.309 | rejected (d@50 +0.010; without 6141 +0.012)  |
| 20 | path-length normalisation of file score (/ n_words^0.5) | 0.226 | 0.279 | 0.348 | 0.345 | rejected (d@50 -0.007; without 6141 +0.003)  |
| 21 | hop weight 0.25 | 0.155 | 0.277 | 0.314 | 0.345 | rejected (d@50 -0.010; without 6141 -0.012)  |
| 22 | hop weight 1.0 | 0.183 | 0.286 | 0.337 | 0.345 | rejected (d@50 -0.001; without 6141 -0.005)  |
| 23 | drop dir words >1% of dirs | 0.209 | 0.236 | 0.280 | 0.345 | rejected (d@50 -0.051; without 6141 -0.061)  |
| 24 | drop dir words >3% of dirs | 0.217 | 0.297 | 0.337 | 0.355 | rejected (d@50 +0.010; without 6141 +0.012)  |
| 25 | dir idf ln(1+D/df) | 0.194 | 0.287 | 0.327 | 0.345 | rejected (d@50 +0.000; without 6141 +0.000)  |

Final config: {"tf":1,"joins":1,"bigrams":1,"dirShare":0.02,"hop":0.5,"hopTop":25,"folders":1,"fcov":1,"stage2":1,"dedupe":1,"beta":0.1}

## Notes
- Superseded before the universality rule: an absolute cut "dir words in >40 dirs" (+0.023), and a "dir word x ln(1+files carrying it)" weight (-0.048). The absolute 40 was replaced by the relative share (iteration 3-5).
- Share cut robustness (dev @50, with folders+hop): 1% 0.236, 2% 0.287, 3% 0.297, 5% 0.22 (holdout @50 0.49/0.49/0.49/0.41). 2-3% is the plateau; 3% chosen as the robust value, not the dev peak.
- Stop: 3 consecutive changes below +0.01 at iterations 17-18, 20-25.
- Rejected with numbers: file-name share cut 5% (-0.098), title x2 (-0.003/-0.023), folder-stage boost beta 0.5 (-0.05), file-score length norm (-0.007), hop 0.25 (-0.010).
- Kept without 'why' text above: iteration 5 (2% share): same reason as 3, relative to directory count.
