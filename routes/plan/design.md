Design the change, then continue the route.
- Reuse sweep first: for each piece the change needs, look for an existing one with `{cli} refs --declarations <name> --task {task}` and read the matches. Reuse over new; a new helper beside an existing one is a defect.
- Write down the design and its real alternatives, with the cost and risk of each and one recommendation. Cite `path:line` for facts; name assumptions.
- A decision is material when the alternatives lead to different code, contracts or behaviour a reviewer would notice; it is routine when policy, the requirement or the project's structure already settles it. Never ask about a routine one.
- Ask the user each material decision with one `AskUserQuestion`, one question per decision, ending the question with `[ambicode gate decision:<slug>]` (a short kebab slug per decision). An unanswered decision stays open and the plan stays a draft.
Then run `{cli} route next --task {task}`.
