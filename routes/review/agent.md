# Independent review
Launch the `ambicode:reviewer` subagent on {work}: `Review the change described in {work}. The code is in the checkout.`
When it returns, run the Then command.
- Do not edit, filter, reorder or summarize its findings, and do not add findings of your own. It writes its answer to a file and the route records it.
- If it wrote no answer, the review is recorded as failed, which is not a clean one.
- Do not read the code yourself to second-guess it.
