# GPT Convertor

A local-first Chrome extension for exporting **selected ChatGPT messages to multiple editable and print-friendly formats at once**.

## Current phase 1 features

- **Assistant replies only** is enabled by default.
- Toggle to include your prompts; select individual turns or all visible turns.
- Choose any combination of **HTML, Markdown, JSON, PDF**.
- Preview captured content and start downloads for all selected text formats independently; if one fails, the others are still attempted and PDF printing remains available.
- If PDF is selected, Chrome opens Print: select **Destination → Save as PDF** and confirm. This produces searchable text because it prints HTML rather than screenshots.
- Ordinary text, code and tables remain HTML text; some SVG/Canvas visuals are captured as images. Unsupported elements show a warning.

**Note:** Automatic PDF download and pixel-perfect rendering are not yet supported. Chrome asks you to confirm the PDF save in phase 1.

## Install without any build step

1. Clone the repo or download its ZIP and extract it.
2. Open `chrome://extensions` in Chrome.
3. Enable **Developer mode** → **Load unpacked**, selecting the repo folder containing `manifest.json`.
4. Visit `https://chatgpt.com/` and open a conversation.
5. Click the GPT Convertor icon. Choose messages and formats, then **Preview & export**.
6. Inspect the preview and click **Download selected formats**. Click **Print / Save PDF** separately whenever needed.

For optional code tests, install Node.js 20+ and run `npm run verify`. This extension needs no npm packages to run.

## Build an installable extension ZIP

Run `npm run package` with Node.js 20+ to create a **deterministic, runtime-only** `dist/gptconvertor-<version>.zip`. The archive contains the manifest, popup/preview pages, CSS, and runtime JavaScript, but no developer dependencies or tests. It does not require a web service or third-party ZIP library.

To install it, extract the ZIP, then open `chrome://extensions` → **Developer mode** → **Load unpacked**, choosing the extracted folder containing `manifest.json`. Do not select the ZIP file itself.

GitHub Actions also runs package integrity checks and attaches the installable ZIP under **Actions → CI run → Artifacts** when the workflow succeeds. This is a development artifact, **not** a Chrome Web Store release. Live authenticated ChatGPT testing and release QA are still required.

## Editable outputs

- `.md`: edit freely in any Markdown editor (Obsidian, VS Code, etc.). Ordinary HTML formatting is converted into Markdown, including nested lists, escaped literal punctuation, and code blocks containing backticks.
- `.html`: an HTML document you can print or edit in an HTML editor; complex visuals may be static.
- `.json`: canonical structured message data (role, source, content, HTML and warnings), ideal for later processing.
- `.pdf`: portable printable version; text is selectable in the standard HTML-based print path.

## Long-conversation capture (experimental)

Click **Scan entire conversation** in the extension popup to temporarily scroll through the page and snapshot messages as they appear. This action is opt-in, processed locally, and **restores your original scroll position**. Choose **Cancel scan** at any time. The scanner stops at 48 steps, 250 messages, or 10 MiB of captured content.

During export, offscreen messages may use snapshots taken earlier in the scan. Their contents cannot be revalidated until rendered again; this is explicitly noted in the output warnings. Incomplete scans are labeled in the popup, preview, and JSON. Repeated identical turns that are never visible together may still be ambiguous, and dynamically lazy-loaded history is not guaranteed complete. A scan reporting "finished" only indicates reaching the current scroll container bottom.

## Project status and next milestones

**Current:** v0.1 development build with Chromium/Node regression tests and automatically packaged installable ZIPs. Authenticated live-site validation, Chrome Web Store preparation, and final release QA are still outstanding.

The next priorities are reliable message detection, accurate capture of long conversations, clear warnings for missing content, fully offline exports, PDF/RTL quality, and an installable v1 release. DOCX/ODT and pixel-exact visual mode are later improvements.

See [the updated roadmap and release gates](docs/PLAN.md) and [browser QA checklist](docs/QA.md). Content selection, visual-only replies, merged tables, and offscreen capture have automated regression coverage.

## PDF and printable HTML

Use the **PDF paper** selector in the preview to choose **A4** (default) or **US Letter** before printing or downloading standalone HTML. The selected paper size is included in downloaded HTML print styles. Chrome's Print → **Save as PDF** remains the PDF save path.

Printed tables use paginated table layout rather than on-screen horizontal scrolling, headings avoid being orphaned, and long code lines wrap. Ordinary paragraphs—including Persian/Arabic and mixed English—stay selectable/searchable; complex visuals can remain rasterized. Native print output may still vary with fonts and the destination printer, so verify critical documents before sharing.

**Export notes** now travel with the preview, HTML, and Markdown, including incomplete conversation scans, skipped turns, and warnings for individual media elements. JSON also retains the structured warning details.

## Keyboard and accessibility support

The popup provides explicitly named message checkboxes, a readable empty state, keyboard focus indicators, and announcements for selection counts. During a long scan, selection controls are unavailable; press **Escape** or choose **Cancel scan** to stop. The preview includes a keyboard-accessible **Skip to exported document** link. Screen-reader and high-contrast manual acceptance remain part of the later release gate.

## Known limitations

- A user-triggered **Scan entire conversation** action attempts to scroll through long/virtualized chats (up to 48 steps, 250 messages, or 10 MiB of captured content). It returns to your original scroll position; cancelling or hitting a limit yields an explicitly incomplete scan. Some lazy-loaded turns may still be missed.
- ChatGPT updates can break message selectors.
- The extension tries to embed already-loaded, origin-clean images as PNG directly into exported HTML (with 1 MiB per-image and 2 MiB per-message inline budgets). Cross-origin/tainted, oversized, or unloaded images still use external URLs and may require network connectivity.
- Rich UI components are not guaranteed pixel-exact or interactive. Canvas and iframe capture may be blocked.
- PDF workflow is manual Save as PDF; complete E2E browser QA still required.

## Export failures and retries

The preview reports which file downloads **started**, not which files finished saving to disk. If one format is blocked, remaining selected formats are still attempted and the Print / Save as PDF path remains available. Check Chrome Downloads for actual completion. Retrying an export may produce duplicate successfully downloaded files.

If removing temporary export data fails, the preview retains the content and shows an error rather than falsely claiming it was cleared.

## Privacy

No external processing service and no telemetry. Captured text is temporarily stored in `chrome.storage.session` until cleared or browser session ends. Use **Clear saved preview** on the preview page to remove a job.

## Project documentation

See [the phased technical plan](docs/PLAN.md) and [manual QA checklist](docs/QA.md).
