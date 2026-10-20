export default [
  ['16', 'folder stage as tie-break only: coverage folders, beta 0.1', { folders: 1, fcov: 1, stage2: 1, dedupe: 1, beta: 0.1 }, 'folders named for a feature make all their files carry its word, in any layout; weight small so own evidence dominates'],
  ['17', 'folder beta 0.25', { beta: 0.25 }, ''],
  ['18', 'top 15 folders', { topFolders: 15 }, ''],
  ['19', 'folder size exponent 2', { fLog: 2 }, ''],
  ['20', 'path-length normalisation of file score (/ n_words^0.5)', { lnorm: 0.5 }, 'long paths collect more words by chance in any repo (BM25 length norm)'],
  ['21', 'hop weight 0.25', { hop: 0.25 }, ''],
  ['22', 'hop weight 1.0', { hop: 1.0 }, ''],
  ['23', 'drop dir words >1% of dirs', { dirShare: 0.01 }, ''],
  ['24', 'drop dir words >3% of dirs', { dirShare: 0.03 }, ''],
  ['25', 'dir idf ln(1+D/df)', { dirIdf: 'ln1' }, ''],
];
