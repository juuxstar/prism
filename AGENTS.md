@/Users/juuxstar/.codex/RTK.md

# Code Organization

- Place standalone helper functions toward the end of a file when possible, especially after the main exported class or singleton. Keep helpers inside the class only when they need class state or belong to the class API.
- Place interfaces and type declarations toward the end of a file when possible, especially after the main export of the file.

# Commands

Every command is `npm start <command>`, spelled after FrontLobby's where the two overlap; `npm start -- --help` lists them.

- `npm start prism [dev|prod]` starts PRism in Docker in the foreground (default `dev`); `npm start -- prism -d` starts it in the background. There is no `up`.
- `npm stop` stops the container and keeps it. `npm start down [dev|prod]` stops and removes it. `npm start logs [dev|prod]` follows its output.
- `npm start lint` must report 0 errors, and `npm start typecheck [client|server]` must exit 0; it checks both when given neither. `lint` only fixes with `-- lint --fix`.
- PRism has no test suite and no `npm test`.
