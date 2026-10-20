# Ranking iterations (dev = 6141, 5967, 6292, 5948, 3571, 6086; mean recall of reachable truth; fcov = share of truth under top-5 deduped folders)

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
