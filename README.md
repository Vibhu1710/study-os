# Study OS

**Study OS** is a local-first web app for serious exam prep: you define **objectives** (non-overlapping study cycles), build a weighted **syllabus**, plan work in **phases**, and track daily execution on a **GitHub-style calendar** with heatmaps, notes, and analytics. Everything is scoped to one active objective at a time so stats never mix across exam cycles.

Built with **Next.js** (App Router), **React**, **SQLite** (`better-sqlite3`), and **Drizzle ORM**. No cloud database is required for development—each developer gets a private `data/study-os.db` file on disk.

---

## Features at a glance

| Area | What you can do |
|------|-----------------|
| **Objectives** | Create cycles with start/end dates; switch the active cycle; archive past cycles (read-only). |
| **Syllabus** | Subjects with colors; topics and subtopics with weights; backlog “parking lot”; in-phase tagging (`+φ` / `−φ`). |
| **Edit topic** | Titles, weights, notes, subtopic reorder (drag-and-drop), add/remove subtopics. |
| **Edit completion log** | From Syllabus: change **past** log dates, backfill logs, or remove logs (History icon)—without opening retro-edit on the whole calendar. |
| **Home / Calendar** | Contribution-style heatmap; phase window overlay; pick any day; plan topics for today/future within the phase. |
| **Day target panel** | Today’s plan, check off subtopics, day notes, topic notes, drag reschedule, topic edit/delete. |
| **Phase targets** | Schedule/reschedule in-phase topics; active vs completed rows; weight remaining per topic. |
| **Dashboard** | Phase progress, subject share, planned vs completed weight, 14-day velocity, drill-downs. |
| **Momentum** | Sandglass sessions (start/end, odd/even flips, partials), effort heatmap, coverage compare toggle, daily bar charts. |
| **Settings** | Objective lifecycle, phase dates, global sandglass minutes, subject/topic management entry points. |

### Core rules (product logic)

- **Planning** is allowed on days inside the **current phase** (today through phase end, within the objective).
- **Live completion** (checkboxes) is **today only** on the Home calendar.
- **Past logs** are normally locked; **Syllabus → Edit completion log** is the supported way to fix history on past days (not today—use Home for today).
- **One planned day per topic** at a time: scheduling elsewhere prompts to **move** the existing plan.
- **Phase membership** (`phase_topics`) is independent of log dates—a topic can be dephased even if a subtopic was logged inside the phase window.
- **Weights** are normalized at the syllabus level; display uses sensible rounding (tenths).

---

## Prerequisites

- **Node.js** 20+ (LTS recommended)
- **npm** 10+
- macOS / Linux / WSL recommended (`better-sqlite3` uses native bindings; Windows may need build tools)

---

## Quick start

```bash
git clone <your-repo-url>
cd study-os
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

On first run the app creates:

```text
data/
  study-os.db    # SQLite database (gitignored)
```

There is **no** `.env` required for local dev. See `.env.example` for optional future variables.

### Production build

```bash
npm run build
npm start
```

### Lint

```bash
npm run lint
```

### Database tools

```bash
npm run db:studio    # Drizzle Studio (inspect local DB)
```

Optional maintenance scripts live in `scripts/` (e.g. demo seed, repair helpers)—read each script before running against your DB.

---

## Suggested workflow for new users

1. **Settings / Objectives** — Create an objective with valid date span; set it active.
2. **Syllabus** — Add subjects and topics; split heavy topics into subtopics; assign weights.
3. **Phase** — Define phase start/end; add topics to the phase (`+φ`).
4. **Home** — Drag topics from phase targets onto calendar days; complete subtopics on **today**.
5. **Dashboard** — Review pace, remaining weight, and velocity.
6. **Corrections** — Use **Edit completion log** (History) on Syllabus for past-date fixes.

---

## Project structure

```text
study-os/
├── src/
│   ├── app/              # Routes: /, /syllabus, /rhythm, /dashboard, /objectives, /settings
│   ├── components/       # UI by feature (home, syllabus, calendar, dashboard, …)
│   ├── db/               # Schema, migrations, getDb()
│   └── lib/              # Actions, services, progress/weight math, date helpers
├── scripts/              # Node CLI helpers (seed, repair)
├── data/                 # Local DB (gitignored—create via app)
├── drizzle.config.ts
└── package.json
```

**Important paths for contributors**

- `src/db/schema.ts` — tables: objectives, subjects, topics, subtopics, phases, day plans, completion events, notes.
- `src/lib/services/topic-completion.ts` — completion events and today-only guards.
- `src/lib/services/edit-log.ts` — syllabus past log edits.
- `src/lib/services/day-assignment.ts` — schedule / move / conflict handling.
- `src/lib/phase-scope-weight.ts` — dashboard phase vs prior completion scope.

---

## Git & collaboration

### What is **not** in the repo (by design)

- `node_modules/`
- `.next/` build cache
- `data/` and any `*.db` / WAL files
- `.env` (secrets)
- `.cursor/` local editor/agent state

Each developer maintains their **own** SQLite file. Do not commit personal study data unless the team explicitly wants a shared seed (use a script instead).

### Branching

Default branch: **`main`**. Use feature branches and pull requests for shared changes.

### Connect to GitHub (first time on your machine)

If this clone has no `origin` yet:

```bash
# From the project root, after commits exist locally:
gh auth login
gh repo create study-os --source=. --public --remote=origin --description "Local-first exam study tracker (Next.js + SQLite)"
git push -u origin main
```

Use `--private` instead of `--public` if you prefer a private repo, then add collaborators under **Settings → Collaborators** on GitHub.

If the repo already exists on GitHub:

```bash
git remote add origin git@github.com:<YOUR_USER>/study-os.git
git push -u origin main
```

---

## Tech stack

| Layer | Choice |
|-------|--------|
| Framework | Next.js 16 (App Router) |
| UI | React 19, Tailwind CSS 4, Lucide icons |
| DnD | @dnd-kit |
| Charts | Recharts |
| Database | SQLite via better-sqlite3 |
| ORM | Drizzle |
| Validation | Zod (where used) |

---

## Troubleshooting

| Issue | Try |
|-------|-----|
| `better-sqlite3` install fails | Install Xcode CLT / `build-essential`; use Node 20 LTS. |
| Blank stats after pull | Normal—your `data/` is local. Create or import an objective in the app. |
| “Past completion logs are locked” on Home | Expected; use **Syllabus → History (Edit completion log)** for past dates. |
| Port 3000 in use | `npm run dev -- -p 3001` |

---

## License

Private team project unless otherwise specified by the repository owner. Add a `LICENSE` file when you choose an open-source license.

---

## Contributing

1. Pull latest `main`.
2. Create a branch: `git checkout -b feature/short-description`.
3. Run `npm run build` before opening a PR.
4. Keep commits focused; describe **why** in the PR, not only **what**.

Questions about product rules (phases, weights, completion) should align with the behaviors above—when in doubt, check `src/lib/services/` and the Syllabus/Home components that call them.
