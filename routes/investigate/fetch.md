Fetch each requirement URL named in the request with your Jira or Confluence MCP tools.
Keep each result whole: the next step reads what you fetched from the server's responses, so do not summarize them. If a call fails, say which one and why; the route will not guess the ticket's content.
Then read one level around the ticket, each item whole, before anything is planned or asked: its child issues and subtasks, its parent epic when it is a story, the issues it links, and the Confluence pages it links. Do not follow links of those items. Fetch at most 10 of them: one level of an epic is typically a handful of stories, and the cap keeps a large epic from flooding the context; name the ones you left out.
A question to the user about scope comes after this reading, never instead of it.
