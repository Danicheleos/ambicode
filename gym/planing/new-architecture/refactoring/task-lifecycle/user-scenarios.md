# User scenarios: what a newcomer expects from each skill

Written from the outside: a developer who installed the plugin, read only the skill list, and starts using it on
their own repository. No knowledge of routes, ledgers or hooks. Each scenario says what they type, what they
expect to see while it works, what they expect at the end, and what would make them give up.

Common expectations, across every skill:

- **I talk in my words.** A Jira link, an issue key, a sentence, a path to an earlier task. The plugin figures
  out which task I mean; I never invent slugs or flags.
- **One task = one folder, named so I recognise it.** `vs-6735`, not `task-b751b52a` or the URL turned into a
  slug. Coming back to the same issue key continues that folder.
- **I can stop at any moment and start again.** Closing the chat, `/clear`, Esc, a new session tomorrow:
  re-running the skill on the same task picks up where it makes sense, never errors with "already started",
  never forks a `-2` / `-iter2` folder.
- **Every question has a "no".** Declining a review, a rule, a check is a normal answer. The run finishes
  cleanly and says what was not verified because I declined.
- **Few questions, only real decisions.** It does not ask what it could find out itself; it asks before
  spending my money or touching something outside the task.
- **Nothing it says is invented.** "Tests green" means it ran my test command and saw exit 0. If something
  was not checked, the final message says so plainly.
- **The folder stays tidy.** After a run I see a short `summary.md` I can read in a minute, the plan/notes it
  produced, and nothing that looks like internal scratch (no `payload-…txt`, no empty files).
- **Parallel work is fine.** Two chats planning two issues, a third reviewing a PR: they do not see or block
  each other.
- **It uses my project's tools.** My test, typecheck, lint commands, as I configured them, not a fixed list
  that refuses half of them.
- **It reuse and extend already existing solutions** Looks for services, models, items that is already implemented 
  to reuse them rather then invent new
- **The code it's writes has the shortest and the most simple possible implementation** The most solutions could be implemented by one precise change. No one pays for long code.
---

## init: first contact

**I type:** `/ambicode:init` right after installing.

**I expect during the run:**
- It looks at the repo on its own: languages, build/test commands, folder layout, main modules.
- It asks me only what it cannot know: "Is `npm test` your unit test command? Is there an e2e suite I should
  not run by default?" Short, with its guess as the default.
- It tells me roughly how long it takes and what it costs, before the expensive part.

**I expect as the result:**
- A config with my check commands, which I can read and edit by hand.
- A project description that a teammate would also find useful: overview, how to navigate, conventions, one
  note per important module (a module with submodules keeps its note inside its folder).
- A one-screen message: what it found, what it assumed, what I should check.
- Re-running init later updates what changed and keeps my manual edits.

**I give up if:** it asks 10 questions, writes notes that are generic boilerplate, or later refuses to run
the very commands it recorded here.

---

## investigate: "how does this work / why does this happen"

**I type:** `/ambicode:investigate why does the dashboard reload twice after saving a view?` or a ticket link.

**I expect during the run:**
- It reads the ticket if I gave a link, then goes to the right part of the code fast, using what init learned
  instead of grepping the whole repo.
- Could use a web search in cases it requires.
- It does not edit code.
- At most 3 clarifying question, only if the request is genuinely ambiguous.

**I expect as the result:**
- An short answer in the chat: the explanation, the named modules, and what it is not sure about. and a link to the saved file.
- The detailed answer saved in the task folder with `file:line`, so a later `plan` or `task` on this issue starts from it.
- Faster and cheaper than asking the bare model, and at least as correct; otherwise I will stop using it.

**I give up if:** citations point to lines that do not say what it claims, or it spends minutes re-discovering
the project structure every time.

---

## plan: "how should we build this"

**I type:** `/ambicode:plan https://…/browse/VS-6735` or `/ambicode:plan vs-6735 add view management`.

**I expect during the run:**
- It reads the ticket (and linked docs), looks at the code, and reuses an earlier investigation of the same issue.
- It asks me about real design choices ("keep views per user or per team?"), not about things it can read.
- If the ticket is too large it proposes splitting into iterations, each one a shippable step.
- Plan is started with a high-level design and if it fits project, feature and requirements adds details.
- It follows projects style, searches for items to reuse first rather then add new before writing a final report.

**I expect as the result:**
- `plan.md` in `.ambicode/tasks/vs-6735/`: goal, the detailed iterations that could be used to pass them to implementors as instructions, 
  for each one the files to change, what "done" means.
- A short message: the plan in five lines and what it could not decide.
- I can edit `plan.md` by hand; `task` follows my edited version.
- Running plan again on the same issue revises the existing plan instead of creating a new folder.

**I give up if:** the plan is a generic essay, invents files that do not exist or ignores already existing solutions,
or a second run produces an unrelated plan.

---

## task: "build it"

**I type:**
- `/ambicode:task` → get the task from current session and continues.
- `/ambicode:task vs-6735` → do the whole plan, iteration after iteration.
- `/ambicode:task vs-6735 iteration 2` or `/ambicode:task vs-6735 2` → only iteration 2.
- `/ambicode:task fix the empty-list crash in totals` → a small task with no plan.

**I expect during the run:**
- It follows plan or implementation result if it exists. 
- It says which iteration it is on and what it is about to change.
- It changes the code, runs my checks only after my approval(tests, typecheck, lint) and fixes until they are green, without asking
  me after every edit.
- With no iteration named, it runs every iteration in order and reviews each one on its own; it stops and
  tells me if one cannot be made green, instead of piling the next one on top of a broken one.
- With an iteration named, it does only that one and then offers an independent review; I can say no.
- I can interrupt; `/ambicode:task vs-6735` later continues from the first iteration that is not done, in the
  same folder.

**I expect as the result:**
- It implements the code following KISS principles. Short and Clean. Reuses it's own code and already existed.
  Does not inflate the code just to cover theoretical edge cases. 
- Code changes in my working tree (not committed unless I ask), formatted the way the project formats.
- A final message per run: what changed (file list), which checks ran with their results, the review result
  or "review skipped by you", what is not verified.
- `summary.md` in the task folder: request, plan, each iteration with done / interrupted / blocked, checks,
  open gaps. Enough to write the PR description from.

**I give up if:** it invents tools that already exists, it write the code I have to refactor, stuck in fixing loop, loses track the task it's working on

---

## review: "check this change"

**I type:** `/ambicode:review` (my uncommitted changes), `/ambicode:review !123` or a PR/MR link.

**I expect during the run:**
- The reviewer is independent: it does not just trust the author's description.
- It respects the project's rules (from `rules`) and says which rules it applied.
- It reviews not only the exact changes, but also their side effects.
- It spots not only issues with logic, rules or securityl. But also code style, code-smell, if 
  the implementation reuses and not 'invents a bicycle', the code is the best, the most simple and clean

**I expect as the result:**
- Findings ranked by severity, each with file:line, why it is a problem, and a concrete fix; no style nitpicks
  the linter already covers.
- A clear verdict: nothing important / fix these first.
- For a PR/MR: it asks before posting anything to GitLab/GitHub, and posts only what I approved.
- "No findings" is a valid, short result.

**I give up if:** half the findings are wrong, it posts comments without asking, or every review takes longer
than reading the diff myself.

---

## rules: "teach it our conventions"

**I type:** `/ambicode:rules` or `/ambicode:rules we never call the API from components, only from services`.

**I expect during the run:**
- From a sentence: it turns it into a rule, shows me where it applies (which paths) and an example of a
  violation it would catch in my code.
- With no text: it proposes rules it observed in the codebase, a few at a time, and I accept or reject each.
- It never adds a rule I did not accept.

**I expect as the result:**
- Rules in readable files in the repo that I can edit or delete by hand, and that a teammate can review in a PR.
- From then on, `task` follows them while writing and `review` checks them, and both name the rule when it
  matters.

**I give up if:** rules are vague ("write clean code"), fire everywhere, or silently block my own commands.

---

## Cross-skill flows a newcomer will try in the first week

1. **Ticket to PR:** `init` once → `plan VS-6735` → `task vs-6735` (all iterations, auto-review) → read
   `summary.md` → open the PR → `review !<mr>` on the PR.
2. **Stepwise:** `task vs-6735 iteration 1` → decline the review → next day in a new chat
   `task vs-6735 iteration 2` → review accepted → fixes applied.
3. **Interrupted:** `task vs-6735` → Esc in the middle of iteration 2 → `/clear` → `task vs-6735` continues
   iteration 2, iteration 1 stays done.
4. **Change of mind:** halfway through `task vs-6735` I start `task vs-6800` in the same chat: the first one
   is closed as interrupted, the second starts; going back to `vs-6735` later continues it.
5. **Parallel:** chat A plans `vs-6735`, chat B plans `vs-6800`, chat C reviews MR `!123`: no cross-talk, no
   "route busy".
6. **Investigate then fix:** `investigate why totals crash` → `task` on the same issue reuses the
   investigation instead of starting from scratch.

## What "it works" means to this user

- They never have to read the plugin's docs after the first day.
- They never see an internal error code or an instruction to pass a flag.
- Every final message is honest about what was checked.
- The `.ambicode/` folder is something they would not mind committing or showing a teammate.
