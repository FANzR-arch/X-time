# Imported Thread: X Native Scheduler

Source thread: `019e8dca-9830-7292-a2c4-f15283dd0ee6`

Original title: `确认X定时发帖功能`

Original cwd: `C:\Users\Van Phoil\Documents\Codex\2026-06-03\x`

Imported into: `D:\00_Formula\03_Coding\X-time\imported-thread-019e8dca-x-scheduler`

## Contents

- `conversation.md`: readable transcript and decision record from the original thread.
- `outputs\x-native-scheduler-playwright`: local Playwright scheduler source, copied without `node_modules`.
- `outputs\x-native-scheduler-playwright.zip`: packaged Playwright scheduler from the original thread.
- `outputs\x-native-scheduler-extension`: earlier browser extension prototype.

## Main Deliverable

Use the Playwright version first:

```powershell
cd "D:\00_Formula\03_Coding\X-time\imported-thread-019e8dca-x-scheduler\outputs\x-native-scheduler-playwright"
npm install
npm run login
Copy-Item data\posts.example.json data\posts.json
npm run schedule -- data\posts.json --dry-run
npm run schedule -- data\posts.json
```

The intended flow is:

1. Prepare local `posts.json`.
2. Save X login state locally with `npm run login`.
3. Run the scheduler script.
4. The script controls local Chrome or Edge and uses X web's native scheduling UI.
5. Scheduled posts should appear in X native `Scheduled / Unsent Posts`.

## Notes

- This is a local browser automation tool, not an X API integration.
- The original implementation intentionally avoided stealth or anti-detection bypass logic.
- The Playwright folder here excludes `node_modules`; run `npm install` before use.
