# Review page
When the target was a merge request (`--mr`) or the review has at least one finding, start the review page in the background: `{cli} view --review <reviewId>` (the review id is in part 1 of the report). Give the tokened URL it prints as a link at the end of your final message.
Publishing is the user's: they select and submit comments on the page. Never publish, select or submit for them, and do not call a provider yourself.
With no finding on a local target, there is no page to open.
Then run `{cli} route next --task {task}` and write the final message as the read-back step says, with the link last.
