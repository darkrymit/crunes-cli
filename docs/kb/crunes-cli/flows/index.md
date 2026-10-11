# Flows

* [crunes plugin create](/flows/plugin-create.md) - Scaffolds a plugin with two manifests, so the generated repository is simultaneously a plugin and the single-plugin marketplace that serves it.
* [crunes plugin install](/flows/plugin-install.md) - Resolve from a marketplace, stage, validate the manifest, take consent, then write both registries — with provenance required at the front and staging cleanup guaranteed at the back.
* [crunes repl](/flows/repl.md) - A session in one isolate — repl() initialises once, inputRepl() handles each event, and the host owns readline, slash commands, completion and multiline while the rune sees only cooked input events.
* [crunes run](/flows/run.md) - From argv to sections — prefix-only flag parsing, optional batch splitting, tiered key resolution, isolate setup and the two waves in which output reaches stdout.
* [crunes template apply](/flows/template-apply.md) - Resolve a template through project config then plugins, copy the file, and write a runnable rune entry carrying the template's declared permissions — with shortcut entries letting a project rename a plugin's template.
