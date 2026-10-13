# GPT Convertor

A local-first Chrome extension for exporting **selected ChatGPT messages to multiple editable and print-friendly formats at once**.

## Current phase 1 features

- **Assistant replies only** is enabled by default.
- Toggle to include your prompts; select individual turns or all visible turns.
- Choose any combination of **HTML, Markdown, JSON, PDF**.
- Preview captured content and download all selected text formats from one button.
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

- `.md`: edit freely in any Markdown editor (Obsidian, VS Code, etc.). Ordinary HTML formatting is converted into Markdown.
- `.html`: an HTML document you can print or edit in an HTML editor; complex visuals may be static.
- `.json`: canonical structured message data (role, source, content, HTML and warnings), ideal for later processing.
- `.pdf`: portable printable version; text is selectable in the standard HTML-based print path.

## Project status and next milestones

**Current:** v0.1 source implementation with automated Chromium/Node regression tests. Fixture-based CI passed on October 13, 2026; live authenticated ChatGPT QA and release packaging are still outstanding.

The next priorities are reliable message detection, accurate capture of long conversations, clear warnings for missing content, fully offline exports, PDF/RTL quality, and an installable v1 release. DOCX/ODT and pixel-exact visual mode are later improvements.

See [the updated roadmap and release gates](docs/PLAN.md) and [browser QA checklist](docs/QA.md). Visual-only replies and merged-table/image-dimension preservation are being hardened in the current development work.

## Known limitations

- Scans the currently rendered DOM; very long virtualized conversations may not include offscreen messages.
- ChatGPT updates can break message selectors.
- Images may require a network connection in standalone HTML.
- Rich UI components are not guaranteed pixel-exact or interactive. Canvas and iframe capture may be blocked.
- PDF workflow is manual Save as PDF; complete E2E browser QA still required.

## Privacy

No external processing service and no telemetry. Captured text is temporarily stored in `chrome.storage.session` until cleared or browser session ends. Use **Clear saved preview** on the preview page to remove a job.

## Project documentation

See [the phased technical plan](docs/PLAN.md) and [manual QA checklist](docs/QA.md).
