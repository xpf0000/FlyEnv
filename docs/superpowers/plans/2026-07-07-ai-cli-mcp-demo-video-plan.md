# AI CLI MCP Demo Video Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Produce a 3-5 minute FlyEnv demo video where Codex uses FlyEnv MCP to start MySQL, bootstrap demo data, generate a minimal PHP CRUD app, create a FlyEnv site, start PHP and Nginx, and validate the app in a browser.

**Architecture:** Treat FlyEnv MCP as the environment control and environment context layer, and treat Codex as the local execution layer. The demo should show MCP-based service control and site creation, while SQL execution and PHP file generation happen through Codex's local shell and filesystem abilities. Record the flow in four major blocks: service control, database bootstrap, app generation plus site setup, and browser proof.

**Tech Stack:** FlyEnv MCP, Codex, MySQL, plain PHP with PDO, Nginx, macOS, local browser recording

---

### Task 1: Lock demo prerequisites and freeze the exact runtime values

**Files:**
- Read: `docs/superpowers/specs/2026-07-05-ai-cli-mcp-demo-video-design.md`
- Use: `/Users/x/Sites/ai-mysql-demo`
- Inspect: FlyEnv `MySQL`, `PHP`, `Nginx`, and `MCP` modules

- [ ] **Step 1: Confirm FlyEnv modules and the real PHP version you will use**

Run this in Codex:

```text
Use FlyEnv MCP to inspect local services for mysql, php, and nginx. Tell me which installed versions are enabled or running, and which PHP version number in FlyEnv is the safest one to use for a plain PHP site right now on this machine.
```

Expected:
- Codex shows at least one installed MySQL version.
- Codex shows at least one installed PHP version.
- Codex shows at least one installed Nginx version.
- You end the step with one concrete PHP version number to use in the rest of the demo, for example `83`.

- [ ] **Step 2: Probe the MySQL connection strategy before recording anything**

Run this in Codex:

```text
Use FlyEnv MCP to inspect local MySQL connection details, service exec info, managed file paths, and any available socket path. I need one exact local mysql client command that will work on this macOS machine for the rest of the demo.

Rules:
- prefer a socket-based root login if a socket path is available
- if a password returned by MCP is masked, do not pretend it is usable
- if needed, inspect locally available FlyEnv-managed config paths to determine a working connection method
- do not change the MySQL root password

Return:
1. the exact mysql command you will use for subsequent SQL steps
2. the active MySQL version
3. the host, port, and socket you intend to use
```

Expected:
- Codex gives one concrete `mysql` command pattern for this machine.
- You know whether the demo will use socket auth or TCP auth.
- You know whether Codex can work without exposing a clear password on screen.

- [ ] **Step 3: Reset the demo filesystem and database state**

Run this in Codex:

```text
Reset the demo workspace for a fresh recording.

1. Remove /Users/x/Sites/ai-mysql-demo if it already exists.
2. Recreate /Users/x/Sites/ai-mysql-demo/public as an empty web root.
3. Using the working local mysql command you already verified, drop the database flyenv_ai_demo if it exists.
4. Confirm the project directory is clean and the database no longer exists.
```

Expected:
- `/Users/x/Sites/ai-mysql-demo/public` exists and is empty.
- `flyenv_ai_demo` does not exist.
- You are back to a fully clean starting point.

- [ ] **Step 4: Decide how to handle risky MCP confirmations on camera**

Do this before the real take:

```text
Note that FlyEnv MCP treats start_service and create_site as confirm-by-default risky tools. During recording, allow Codex to show the confirmation briefly, then approve it. Do not try to hide the prompt unless it becomes excessively repetitive.
```

Expected:
- You intentionally keep at least one approval visible on screen.
- The audience sees that FlyEnv MCP does not silently mutate the environment.

### Task 2: Dry-run service control and database bootstrap

**Files:**
- Use: `/Users/x/Sites/ai-mysql-demo`
- Create later: `flyenv_ai_demo.demo_items`
- Verify with: local `mysql` client output

- [ ] **Step 1: Dry-run the MySQL start prompt**

Run this in Codex:

```text
Use FlyEnv MCP to inspect the local MySQL service. If MySQL is not running, start the enabled MySQL service through FlyEnv MCP. Then confirm that MySQL is running and tell me which version is active.
```

Expected:
- If MySQL was stopped, Codex uses `start_service`.
- Codex confirms MySQL is running afterward.
- You know what the service-control output will look like during the real take.

- [ ] **Step 2: Dry-run the database and table creation prompt**

Run this in Codex:

```text
Use FlyEnv MCP to get the local MySQL connection details and execution hints. Then use the verified local mysql client command on this machine to create a database named flyenv_ai_demo if it does not already exist, and create a table named demo_items with these columns:

- id INT PRIMARY KEY AUTO_INCREMENT
- title VARCHAR(255) NOT NULL
- status VARCHAR(50) NOT NULL DEFAULT 'new'
- created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP

After that, show me the exact SQL you ran and confirm the table exists.
```

Expected:
- `flyenv_ai_demo` exists.
- `demo_items` exists.
- Codex shows short, readable SQL that is safe to capture on screen.

- [ ] **Step 3: Dry-run the seed-data prompt**

Run this in Codex:

```text
Using the same local MySQL connection, insert three rows into flyenv_ai_demo.demo_items with these titles:

- First demo item
- Second demo item
- Third demo item

Set the status to 'new' for all of them. Then query all rows from flyenv_ai_demo.demo_items ordered by id ascending and show the full result.
```

Expected:
- The query returns exactly 3 rows.
- The row titles are clean and readable on screen.
- The SQL output is short enough to pause on during editing.

- [ ] **Step 4: Verify the database state outside the chat output**

Run this in the shell:

```bash
mysql -uroot -e "USE flyenv_ai_demo; SELECT id,title,status FROM demo_items ORDER BY id ASC;"
```

Expected:
- Output shows 3 rows.

If the exact machine needs socket auth instead of plain `mysql -uroot`, rerun the verification with the exact working command pattern discovered in Task 1 Step 2.

### Task 3: Dry-run the PHP app generation and FlyEnv site provisioning

**Files:**
- Create: `/Users/x/Sites/ai-mysql-demo/src/db.php`
- Create: `/Users/x/Sites/ai-mysql-demo/public/index.php`
- Create: `/Users/x/Sites/ai-mysql-demo/public/edit.php`
- Create: `/Users/x/Sites/ai-mysql-demo/public/delete.php`
- Use: FlyEnv site `ai-mysql-demo.test`

- [ ] **Step 1: Generate a tightly scoped PHP app instead of an open-ended one**

Run this in Codex:

```text
Create a minimal plain PHP CRUD demo app under /Users/x/Sites/ai-mysql-demo.

Create exactly these files:
- /Users/x/Sites/ai-mysql-demo/src/db.php
- /Users/x/Sites/ai-mysql-demo/public/index.php
- /Users/x/Sites/ai-mysql-demo/public/edit.php
- /Users/x/Sites/ai-mysql-demo/public/delete.php

Requirements:
- use plain PHP, not a framework
- use PDO to connect to the local MySQL database flyenv_ai_demo
- keep the web root at /Users/x/Sites/ai-mysql-demo/public
- support listing all rows from demo_items
- support creating a new row
- support updating an existing row
- support deleting an existing row
- keep the UI simple and readable
- do not add authentication
- do not add external dependencies unless absolutely necessary

After creating the files, summarize the file structure and briefly explain what each file does.
```

Expected:
- Exactly 4 files exist.
- The structure is small enough to explain in one breath during recording.
- The generated app does not bring in Composer or framework setup.

- [ ] **Step 2: Provision the FlyEnv site and start PHP plus Nginx**

Run this in Codex, replacing `83` if Task 1 Step 1 established a different safe PHP version:

```text
Use FlyEnv MCP to create a FlyEnv site for this app with these settings:

- site name: ai-mysql-demo.test
- root: /Users/x/Sites/ai-mysql-demo/public
- phpVersion: 83
- useSSL: false
- autoSSL: false

Then use FlyEnv MCP to start PHP and Nginx if they are not already running. After that, use FlyEnv MCP to resolve the site URLs and tell me the best local URL to open in the browser.
```

Expected:
- `create_site` succeeds.
- `php` is running.
- `nginx` is running.
- Codex returns a clear local URL such as `http://ai-mysql-demo.test`.

- [ ] **Step 3: Verify the generated site without opening the browser yet**

Run this in the shell:

```bash
curl -s http://ai-mysql-demo.test | head -n 20
```

Expected:
- HTML output is returned.
- The page contains visible demo item content or obvious CRUD form markup.

- [ ] **Step 4: Ask Codex for the on-screen pre-browser checklist**

Run this in Codex:

```text
Before I open the site in the browser, summarize the current local setup in one short checklist:

- MySQL status
- database name
- table name
- app root
- site URL
- whether PHP is running
- whether Nginx is running

Keep it concise and ready for on-screen capture.
```

Expected:
- Codex returns a short checklist that can stay on screen for 2-3 seconds.
- No long explanations appear that would slow the cut.

### Task 4: Record the terminal takes in a fixed shot order

**Files:**
- Capture: terminal recording of Codex session
- Reference: `docs/superpowers/specs/2026-07-05-ai-cli-mcp-demo-video-design.md`
- Use: prompts from Tasks 2 and 3

- [ ] **Step 1: Record the cold open as a single promise statement**

Type this in Codex and record the screen:

```text
Start MySQL through FlyEnv MCP, create a demo database and table, insert sample rows, generate a simple PHP CRUD app, create a FlyEnv site for it, start PHP and Nginx, then give me the URL so I can test it in the browser.
```

Expected:
- This becomes the first 10-15 seconds of the video.
- The audience understands the full promise before any rewind or setup explanation.

- [ ] **Step 2: Record the MySQL service-control and database-bootstrap block**

Capture in this exact order:

1. Prompt from Task 2 Step 1
2. Prompt from Task 2 Step 2
3. Prompt from Task 2 Step 3

Expected:
- You finish the block with a clean `SELECT` result showing 3 rows.

- [ ] **Step 3: Record the app-generation and site-setup block**

Capture in this exact order:

1. Prompt from Task 3 Step 1
2. Prompt from Task 3 Step 2
3. Prompt from Task 3 Step 4

Expected:
- You finish the block with a short checklist and a clear site URL.

- [ ] **Step 4: Keep one or two approval moments on screen, but trim repetition later**

Capture at least one confirmation for:

- `start_service`
- or `create_site`

Expected:
- The audience sees that risky MCP actions require confirmation.
- The final cut still moves quickly because repeated confirmations can be trimmed.

### Task 5: Record the browser proof and the exact CRUD path

**Files:**
- Use: browser at the local site URL
- Verify against: `flyenv_ai_demo.demo_items`

- [ ] **Step 1: Open the app and show the 3 seeded rows**

Open:

```text
http://ai-mysql-demo.test
```

Expected:
- The page loads.
- The initial list shows the 3 seeded rows or an equivalent visible list state.

- [ ] **Step 2: Record one create action**

Use this exact browser action:

```text
Create a new row with title "Browser created item" and status "new".
```

Expected:
- The new row appears in the list immediately or after redirect.

- [ ] **Step 3: Record one update action**

Use this exact browser action:

```text
Edit "Second demo item" and change its title to "Second demo item updated".
```

Expected:
- The updated title is visible in the list after saving.

- [ ] **Step 4: Record one delete action**

Use this exact browser action:

```text
Delete "Third demo item".
```

Expected:
- The deleted row disappears from the list.

- [ ] **Step 5: Verify the final browser state with one quick SQL check**

Run this in Codex after the browser take:

```text
Use the same local MySQL connection and show me the current rows in flyenv_ai_demo.demo_items ordered by id ascending, so I can confirm the browser actions changed the real database.
```

Expected:
- The SQL result reflects the created, updated, and deleted rows.
- This can be used as an optional end-card proof shot.

### Task 6: Edit the final cut for a fast external-facing demo

**Files:**
- Source: terminal recording
- Source: browser recording
- Reference: `docs/superpowers/specs/2026-07-05-ai-cli-mcp-demo-video-design.md`

- [ ] **Step 1: Assemble the cut in this exact order**

Timeline order:

1. Cold open prompt
2. MySQL start through MCP
3. Database and table creation
4. Seed rows query
5. PHP app generation
6. FlyEnv site creation plus PHP/Nginx start
7. Returned local URL
8. Browser CRUD actions
9. Optional closing SQL verification

Expected:
- The story reads as one uninterrupted local-agent workflow.

- [ ] **Step 2: Add short English step captions**

Use these captions:

```text
1. Start MySQL through FlyEnv MCP
2. Bootstrap a local database
3. Seed demo data
4. Generate a PHP CRUD app
5. Create a FlyEnv site and launch it
6. Test it in the browser
```

Expected:
- The viewer can follow the flow even without voiceover.

- [ ] **Step 3: Trim dead time and keep the runtime under 5 minutes**

Trim:

- long tool-thinking pauses
- repeated confirmation screens
- long shell output that adds no new information

Keep:

- one visible MCP confirmation
- one visible `SELECT` with 3 seeded rows
- one visible returned site URL
- one visible browser CRUD cycle

Expected:
- Final runtime lands between 3 and 5 minutes.

- [ ] **Step 4: End on the one-sentence product truth**

Use this final on-screen line or voiceover:

```text
FlyEnv handled the local environment, MCP exposed it to Codex, and Codex turned it into a working local app.
```

Expected:
- The value proposition lands cleanly.

### Task 7: Final rehearsal and go/no-go check

**Files:**
- Verify: all recorded assets and the live local demo

- [ ] **Step 1: Rehearse the whole flow one last time without recording**

Run through:

1. Task 2 prompts
2. Task 3 prompts
3. Browser create/update/delete path

Expected:
- No blocking surprises remain.

- [ ] **Step 2: Use this final go/no-go checklist**

Confirm all of the following:

```text
- MySQL can be started from Codex through FlyEnv MCP
- database bootstrap succeeds without manual intervention
- demo_items shows 3 seeded rows before the browser take
- PHP app files exist under /Users/x/Sites/ai-mysql-demo
- ai-mysql-demo.test resolves and loads in the browser
- browser create/update/delete operations mutate the real MySQL data
- at least one MCP confirmation prompt is visible in the raw recording
- the final cut can be kept under 5 minutes
```

Expected:
- If every line is true, record the final take.
- If any line is false, fix it before recording instead of “trying to wing it” on camera.
