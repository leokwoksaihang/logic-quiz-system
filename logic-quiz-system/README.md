# Logic Quiz System

An online logic test and grading system for philosophy / logic courses, supporting four question types: **Truth Table**, **Natural Deduction**, **Predicate Logic**, and **Translation**.

---

## Quick Start

### 1. Prerequisites
- **Node.js 18+** — download from [nodejs.org](https://nodejs.org)

### 2. Install
```bash
cd logic-quiz-system
npm install
```

### 3. Run
```bash
npm start
```

Open your browser at **http://localhost:3000**

Default instructor login:
- Username: `instructor`
- Password: `logic2024`

> **Change this password immediately** — go to Students tab and use "Reset Password", or update `db.js` before first run.

---

## Hosting Online

### Option A — Railway (free tier, easiest)
1. Push the folder to a GitHub repo.
2. Go to [railway.app](https://railway.app) → New Project → Deploy from GitHub.
3. Set environment variable `JWT_SECRET` to a long random string.
4. Railway auto-detects `npm start` and gives you a public URL.

### Option B — Render (free tier)
1. Push to GitHub.
2. [render.com](https://render.com) → New Web Service → connect repo.
3. Build Command: `npm install`, Start Command: `node server.js`.
4. Add environment variable `JWT_SECRET`.

### Option C — VPS / any server
```bash
# Install Node.js, then:
npm install -g pm2
pm2 start server.js --name logic-quiz
pm2 save && pm2 startup
```
Use **nginx** as a reverse proxy on port 80/443, pointing to port 3000.

### Environment Variables
| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3000` | HTTP port |
| `JWT_SECRET` | (weak default) | **Must change in production** |
| `DB_PATH` | `./quiz.db` | Path to SQLite database file |

---

## Instructor Workflow

### Step 1 — Add Inference Rules
Go to **📐 Inference Rules** tab and add the rules you allow.

Example rules to add:

| Symbol | Name | Category | Description |
|--------|------|----------|-------------|
| `Prem` | Premise | propositional | Introduce a given premise |
| `Ass` | Assumption | propositional | Introduce a temporary assumption |
| `→E` | Modus Ponens | propositional | From φ→ψ and φ, derive ψ |
| `→I` | Conditional Proof | propositional | From [Ass φ … ψ], derive φ→ψ |
| `&I` | Conjunction Intro | propositional | From φ and ψ, derive φ&ψ |
| `&E` | Conjunction Elim | propositional | From φ&ψ, derive φ or ψ |
| `vI` | Disjunction Intro | propositional | From φ, derive φvψ |
| `vE` | Disjunction Elim | propositional | Construct case analysis |
| `~I` | Negation Intro | propositional | From [Ass φ … ⊥], derive ~φ |
| `~E` | Negation Elim | propositional | From φ and ~φ, derive ⊥ |
| `⊥E` | Ex Falso | propositional | From ⊥, derive anything |
| `RAA` | Reductio | propositional | From [Ass ~φ … ⊥], derive φ |
| `∀E` | Universal Elim | predicate | From ∀xφ, derive φ[x/t] |
| `∀I` | Universal Intro | predicate | From φ[x/a] (arbitrary a), derive ∀xφ |
| `∃I` | Existential Intro | predicate | From φ[x/t], derive ∃xφ |
| `∃E` | Existential Elim | predicate | Existential elimination |

### Step 2 — Add Questions
Go to **❓ Questions** tab → **+ Add Question**.

**Truth Table question:**
- Enter column headers: `P, Q, P --> Q`
- Enter the correct answer table row by row: `T,T,T` / `T,F,F` / `F,T,T` / `F,F,T`
- Optionally enable the **shortcut method** (2-row × 30-column, manually graded)

**Natural Deduction / Predicate Logic question:**
- Enter premises (one per line) and the conclusion
- Select the allowed inference rules

**Translation question:**
- Write the natural language passage in the question text
- Enter the model translation (premises + conclusion in symbolic form)
- Select allowed rules for the proof

### Step 3 — Create a Session
Go to **📋 Sessions** → **+ New Session**:
- Name the session
- Set a time limit (minutes)
- Select which questions to include
- Save

### Step 4 — Start the Quiz
Click **▶ Start** next to the session. Students who are logged in will immediately see the quiz.

The session ends automatically when the timer runs out, or you can click **⏹ End** manually.

### Step 5 — Grade
Go to **✏️ Grading** tab. Click any submission row to open the grading panel:
- Auto-graded questions show errors line by line
- Shortcut-method truth tables need manual scoring
- Enter a score (0–max) and optional feedback, then **Save**

---

## Student Workflow

1. Go to the system URL and log in with your assigned username and password.
2. Wait on the waiting screen — it will automatically update when the instructor starts the quiz.
3. A countdown timer appears at the top right.
4. Navigate questions using the dot navigator or Prev/Next buttons.
5. Use the **symbol buttons** (& v → ↔ ~ ∀x ∃x ( ) ⊥) to insert logic symbols into any input field.
6. For **Natural Deduction / Predicate Logic**: fill in the 3-column table:
   - Column 1: open assumption line numbers (e.g. `1,3`)
   - Column 2: the derived formula (e.g. `P --> Q`)
   - Column 3: the rule and cited lines (e.g. `→E 1, 2`)
7. Click **Submit Quiz** before time runs out. If time expires, answers are auto-submitted.

---

## Formula Notation

| Logical symbol | What to type |
|---------------|--------------|
| Conjunction ∧ | `&` |
| Disjunction ∨ | `v` |
| Implication → | `-->` |
| Biconditional ↔ | `<->` |
| Negation ¬ | `~` |
| Bottom / Falsum ⊥ | `F` |
| Universal ∀x | `Ax` (followed by variable) |
| Existential ∃x | `Ex` (followed by variable) |
| Predicate P(x,y) | `P(x,y)` |
| Parentheses | `(` `)` |

**Examples:**
- `P & Q` — conjunction
- `P v Q` — disjunction
- `P --> Q` — implication
- `~P` — negation
- `AxP(x)` — ∀x P(x)
- `Ex(P(x) & Q(x))` — ∃x (P(x) & Q(x))

---

## Grading Logic

### Truth Table
Cells are compared one-by-one against the instructor's answer. Score = (correct cells) / (total cells).

### Natural Deduction / Predicate Logic
Three things are checked:
1. **Each step**: Is the rule correctly applied to the cited lines?
2. **Conclusion**: Does the final line match the required conclusion?
3. **Discharged assumptions**: Are all temporary assumptions closed off?

Full marks if all three pass. 50% if only the conclusion is reached (with errors). Partial otherwise.

**Supported rules for auto-grading:**
`Prem`, `Ass`, `Reit`, `&I`, `&E`, `vI`, `vE`, `→I`, `→E` (MP), `~I`, `~E`, `⊥E`, `RAA`, `<->I`, `<->E`, `∀I`, `∀E`, `∃I`, `∃E`

The grader accepts many spelling variants (e.g. `MP`, `→E`, `->E`, `ImpE`, `Modus Ponens` are all recognised as the same rule).

### Translation
- 40% of marks: translation accuracy (premises + conclusion match the model)
- 60% of marks: correctness of the verification proof

---

## File Structure

```
logic-quiz-system/
├── server.js          # Express server + REST API
├── db.js              # SQLite database layer (better-sqlite3)
├── grader.js          # Formula parser + auto-grader
├── package.json
├── quiz.db            # Created automatically on first run
└── public/
    ├── login.html     # Login page
    ├── student.html   # Student quiz interface
    └── instructor.html # Instructor dashboard
```

---

## Security Notes

- Change `JWT_SECRET` via environment variable before deploying publicly.
- Change the default instructor password immediately after setup.
- The SQLite database (`quiz.db`) contains all student data — back it up regularly.
- For production, add HTTPS via a reverse proxy (nginx + Let's Encrypt).
