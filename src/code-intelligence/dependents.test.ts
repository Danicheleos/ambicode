import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { parseHunks, type DiffFile } from '../git/diff.ts';
import { changeTerms } from './dependents.ts';

function file(oldPath: string | null, newPath: string | null, body: string[]): DiffFile {
  const patchSection = ['@@ -1,9 +1,9 @@', ...body].join('\n');
  return { oldPath, newPath, changeKind: newPath === null ? 'deleted' : oldPath === newPath ? 'modified' : 'renamed', binary: false, addedLines: 0, removedLines: 0, hunks: parseHunks(patchSection), patchSection };
}

describe('names other code would use to reach a change', () => {
  it('puts a removed module first, then names that left the code, then names that arrived', () => {
    const terms = changeTerms([
      file('src/save/save-table-views.command.ts', null, ['-export function saveTableViews() {}']),
      file('src/pricing.ts', 'src/pricing.ts', [
        '-export function computeShipping(weight: number) {',
        '+export function shippingFee(weight: number) {',
        ' keep',
      ]),
    ]);
    assert.deepEqual(terms, ['save-table-views.command', 'saveTableViews', 'computeShipping', 'shippingFee']);
  });

  it('names a deleted entry file by its two directories, because its own name matches every such file', () => {
    assert.deepEqual(changeTerms([file('src/features/delete/index.ts', null, ['-export * from "./command";'])]), ['features/delete/index']);
    assert.deepEqual(changeTerms([file('pkg/orders/__init__.py', null, [])]), ['pkg/orders/__init__']);
  });

  it('leaves a deleted test out of the terms and gives modules at most half of them', () => {
    const modules = Array.from({ length: 10 }, (_, index) => file(`src/m${index}/mod${index}.service.ts`, null, []));
    const spec = file('src/x/x.service.spec.ts', null, []);
    const declared = file('a.ts', 'a.ts', Array.from({ length: 10 }, (_, index) => `+export function declared${index}() {}`));
    const terms = changeTerms([spec, ...modules, declared]);
    assert.equal(terms.length, 12);
    assert.ok(!terms.includes('x.service.spec'));
    assert.equal(terms.filter((term) => term.endsWith('.service')).length, 6);
    assert.equal(terms.filter((term) => term.startsWith('declared')).length, 6);
  });

  it('keeps a name that was edited in place as one that arrived, not as one that left', () => {
    const terms = changeTerms([file('a.ts', 'a.ts', ['-export function total(a: number) {', '+export function total(a: number, b: number) {'])]);
    assert.deepEqual(terms, ['total']);
  });

  it('reads declarations in the languages the ecosystems cover, and skips names that match everything', () => {
    const terms = changeTerms([
      file('x.py', 'x.py', ['+def compute_tax(order):', '+class TaxPolicy:']),
      file('x.go', 'x.go', ['+func (s *Server) HandleRefund(w http.ResponseWriter) {']),
      file('x.rs', 'x.rs', ['+pub async fn settle_invoice() {}']),
      file('X.java', 'X.java', ['+    public static Money applyDiscount(Order order) {']),
      file('y.ts', 'y.ts', ['+  constructor(private readonly http: Http) {}', '+  public async loadViews(id: string) {']),
    ]);
    assert.deepEqual(terms.sort(), ['HandleRefund', 'TaxPolicy', 'applyDiscount', 'compute_tax', 'loadViews', 'settle_invoice'].sort());
  });

  it('ignores context lines, calls and local variables, which name nothing another file reaches', () => {
    const terms = changeTerms([file('a.ts', 'a.ts', [' export function untouched() {}', '+  const local = compute(1);', '+  helper(local);'])]);
    assert.deepEqual(terms, []);
  });

  it('asks for at most twelve terms', () => {
    const lines = Array.from({ length: 30 }, (_, index) => `+export function name${index}() {}`);
    assert.equal(changeTerms([file('a.ts', 'a.ts', lines)]).length, 12);
  });
});
