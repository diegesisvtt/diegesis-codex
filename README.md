# Diegesis Codex

**Your worldbuilding studio for tabletop RPG campaigns.**

Diegesis Codex is a multiplatform desktop app for game masters and worldbuilders. Keep your notes, maps, timelines, tables and handouts in one place — and share a player-facing view with your table when it's time to play.

Everything is stored locally in SQLite. No accounts, no cloud, no subscriptions. Your world belongs to you.

## Features

- **Rich notes** — a block-based editor for lore, NPCs, locations and session prep, with wiki-style organization in a hierarchical explorer
- **Hexcrawl maps** — build and run hex-based exploration maps, with a dedicated side panel and renderer
- **Timeline & story view** — track the events of your campaign as a narrative
- **Rollable tables** — create random tables and roll on them, with a built-in roller log
- **Whiteboard** — sketch ideas, diagrams and relationship maps freely
- **PDF reader** — import your rulebooks and adventures, with outline navigation and highlights
- **AI assistant** — chat with an assistant grounded in your own documents, powered by local embeddings and semantic search (runs on your machine)
- **Player view** — a separate, spoiler-free window to show maps and notes to your players
- **Audio panel** — set the mood with music and ambience
- **Plugins** — extend the app with built-in and external plugins
- **Command palette & global search** — jump anywhere in your world in a couple of keystrokes

## Download

Pre-built installers are available on the [Releases](https://github.com/diegesisvtt/diegesis-codex/releases) page:

- **Windows** — installer (NSIS) or portable `.exe`
- **macOS** — `.dmg` or `.zip`
- **Linux** — AppImage or `.deb`

## Build from source

Requirements: [Node.js](https://nodejs.org/) 20+ and npm.

```bash
git clone https://github.com/diegesisvtt/diegesis-codex.git
cd diegesis-codex
npm install
npm run dev
```

Other useful scripts:

| Command            | Description                                  |
| ------------------ | -------------------------------------------- |
| `npm run dev`      | Run the app in development mode (hot reload) |
| `npm run build`    | Build the renderer and Electron main process |
| `npm run dist`     | Build and package for your current platform  |
| `npm run typecheck`| Run TypeScript checks                        |

## Tech stack

Electron · React · TypeScript · Vite · SQLite (better-sqlite3 + sqlite-vec) · BlockNote/TipTap · Transformers.js

## License

Diegesis Codex is free software, licensed under the [GNU General Public License v3.0](LICENSE). You are free to use, study, share and modify it — and any distributed copies or derivatives must remain free and open source under the same terms.
