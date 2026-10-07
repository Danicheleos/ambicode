Run the line printed with the option the user chose.
- It is the `runs:` line of the init question the user answered; run it exactly, it takes no other arguments.
- Do not write `.ambicode/config.yaml` or `.gitignore` yourself.
- If it refuses, show the user the message. If it says the draft changed, show the diff and run the `route next ... --answer init-apply=Adjust` it names to ask again.
