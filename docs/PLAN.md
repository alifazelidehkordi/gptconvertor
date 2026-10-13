# GPT Convertor: implementation plan

## Objective
A Chrome MV3 extension that exports selected ChatGPT content as **editable** Markdown, standalone HTML, structured JSON and searchable, print-ready PDF. The user can request multiple formats in one workflow.

## Phase 1 — shipped source (v0.1)
- Inject a read-only ChatGPT adapter on user action; no persistent ChatGPT host permission.
- Scan loaded conversation turns; default assistant-only, with user-message toggle and per-turn selection.
- Preserve ordinary DOM text, tables, code and styling. SVG becomes an image; Canvas becomes an image where permitted; unsupported iframe/tainted canvas gets a visible placeholder.
- Transfer a structured document to an extension preview using temporary chrome.storage.session.
- Export HTML, Markdown, JSON in one action. For PDF, invoke the Chrome print dialog on print-ready HTML; choose Save as PDF.
- No external back end, telemetry, or remote JS libraries.
- CI for syntax and pure helper tests.

## Phase 2 — fidelity and packaging
- Capture virtualized/offscreen conversation turns by controlled scrolling.
- Preserve complex cards, charts, maps with visual screenshots where required.
- Bundle image assets for fully offline HTML and ZIP export.
- Investigate automatic PDF generation without requiring debugger permission as default.

## Phase 3 — exact mode and editing
- Exact screenshot + aligned searchable text layer with RTL validation.
- DOCX or ODT editor-friendly export.
- Themes, cover pages, table of contents, page breaks, complete integration tests.

## Canonical data model
ExportDocument = { version, title, sourceUrl, exportedAt, warnings, messages: [
  { id, role, text, html, warnings }
] }

## Phase 1 limitations
- PDF file save remains a native browser Save as PDF step.
- Content extraction depends on ChatGPT DOM; changes may require adapter updates.
- Only rendered/in-DOM messages are discovered; image-only or virtualized turns may be incomplete.
- External images in HTML may need network connectivity.
- Special interactive elements are static in PDF.
- Browser QA is mandatory before a stable release.

## Acceptance
1. Scan ChatGPT replies and select multiple messages.
2. Check any combination of HTML, Markdown, JSON and PDF.
3. Preview and export; verify searchable PDF text via Save as PDF.
4. Editable Markdown contains headings, code, tables and links for ordinary HTML.
5. Content never leaves the local browser via an extension-owned server.
