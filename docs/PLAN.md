# GPT Convertor — product roadmap and release gates

_Last reviewed: 2026-10-13. Status refers to merged `main` unless explicitly marked as proposed._

## Product contract

A **local-first Chrome Manifest V3 extension** that lets a user select ChatGPT conversation turns, preview them, and export multiple formats in one workflow:

- **Markdown:** editable text, links, lists, code, and conventional tables.
- **HTML:** readable standalone document, safe markup, preserved ordinary layout and media.
- **JSON:** structured, versioned export with source metadata, roles, and capture warnings.
- **PDF:** searchable/selectable text where it originates as text; print-ready with correct RTL/LTR layout. The native **Print → Save as PDF** workflow is an acceptable reliable fallback.
- **Later editable format:** DOCX or ODT, validated with real document editors.

No extension-owned server, telemetry, remote JavaScript, or broad always-on ChatGPT permission. Users opt in to capturing prompts and to downloading/exporting selected turns.

**A complete v1 app** means reliably capturing supported content in real conversations, honestly reporting unsupported parts, exporting safely, passing automated/manual release gates, and distributing an installable extension. Pixel-exact reproduction of every interactive component and one-click PDF file saving are enhancements, not reasons to block a dependable v1.

## Current baseline (verified in repository)

- **Implemented in v0.1:** MV3 popup + on-demand content script, assistant-only default, per-turn selection, HTML/Markdown/JSON output, preview, Chrome Print → PDF, session storage, HTML sanitization, and clear-preview action.
- **Automated:** Node helper tests and Playwright tests for fixture-based DOM extraction, selection, file exports, sanitizer behavior, and Chromium-generated PDF text. CI ran successfully on `main` after PR #4.
- **Not validated:** end-to-end behavior on live authenticated ChatGPT, very long/virtualized conversations, complex rich UI, fully offline HTML, or Chrome Web Store packaging.
- **Merged hardening (PR #5):** scan/export visual-only messages and retain safe table spans and image dimensions.
- **Merged subsequent work (#6–#10):** stable selections and warnings, bounded long-chat scans, reproducible ZIP, Markdown fidelity and best-effort embedded images. All real-life site claims remain deferred.

## Prioritized phases

### Phase 0 — baseline and scope (DONE)

Deliverables: extension manifest, message data shape, capture/preview/download flow, privacy defaults, installation instructions, CI scaffold.

Gate: load unpacked in Chrome; the four export choices are available; no server is required. Source and fixture tests are not a substitute for live QA.

### Phase 1 — reliability and live-site acceptance (IN PROGRESS; P0)

1. Test **live** chatgpt.com sessions in current stable Chrome, including replies only, opt-in prompts, changed/disappeared turns, retries, and empty/visual-only messages.
2. Preserve merged table cells and sizing for embedded visual images; prevent controls and hidden/irrelevant DOM from leaking into exports.
3. Record versioned fixtures for Persian/Arabic mixed with English, lists, headings, links, code, formulas, tables, charts, and images.
4. Exercise failure states: unsupported page, no selection, no format, page navigation during capture, storage/download errors, no printable content.
5. Verify and document that exported HTML is sanitized and safe to open without scripts or external data submission.
6. Establish regression coverage for each fixed bug.

**Gate:** real-browser manual QA checklist is signed off; no known P0 loss of selected text; CI passes; documented warnings for unsupported visuals. Track live-site QA in issue #1.

### Phase 2 — complete conversation capture (IN PROGRESS; P0, independent of deferred live QA)

1. Define stable turn identities/signatures even when the DOM changes between scan and capture; avoid duplicate/nested message discovery.
2. Handle loaded, lazy, and virtualized messages with **bounded, user-initiated scrolling** and progress/cancel support; preserve scroll position.
3. Detect incomplete captures; clearly show counts and warnings instead of silently claiming complete export.
4. Capture attachments, image-only turns, and rich content metadata where accessible without extra broad permissions.
5. Bound memory/size/time per job; test 100+ turns and multi-megabyte conversations.

**Gate:** all selected reachable turns are exported or individually reported as missing, no accidental navigation or persistent page modification, long-chat test fixtures pass. Extend issue #2.

### Phase 3 — visual fidelity and offline portability (P1)

1. Keep semantic HTML/text as the default. Rasterize only unsupported rich visuals (complex cards, chart canvas, maps) using a user-visible fallback policy.
2. Inline loaded origin-clean image assets where permitted (implemented with conservative size limits); keep cross-origin/unloaded assets as network references with explicit warnings. Later, optionally add ZIP packaging for remaining resources.
3. Validate layout/quality at representative viewport sizes, print widths, and light/dark themes.
4. Keep accessible alt text and explicit placeholders for CORS-protected content, blocked iframes, or screenshots that cannot be captured.

**Gate:** exported HTML opens offline with declared assets; expected images appear in visual-regression fixtures; text remains selectable where possible. Issue #2.

### Phase 4 — reliable PDF delivery (IN PROGRESS; P1)

1. Stabilize print CSS: A4/Letter, page breaks, code wrapping, table overflow, links, fonts, and mixed Persian/Arabic/English.
2. Test PDF text search, selection and copying with real fixtures; include font fallback and ligature tests.
3. Research automatic PDF saving separately. Only adopt a permissions-minimal, policy-compliant implementation that is as reliable as native Chrome print; otherwise keep an accurate Save as PDF instruction.
4. Offer a distinct **exact visual mode** only after proving aligned searchable text or explicitly labeling screenshot-only pages.

**Gate:** reliable searchable native-print PDF across test fixtures with no clipping or invisible content. Automatic download/pixel exactness are optional, not implied by v1. Issues #2 and #3.

### Phase 5 — editable document formats (P2)

1. Prototype DOCX or ODT for headings, paragraphs, lists, links, tables, code and inline images.
2. Round-trip real Persian/Arabic + LTR documents through Word/LibreOffice; validate RTL alignment, table fidelity, editing and page breaks.
3. Add theme/cover/TOC only after core document round trips work.

**Gate:** document remains actually editable; automated structural tests plus real-editor manual acceptance. Issue #3. Cut from v1 if quality is below target.

### Phase 6 — polished UX, privacy and accessibility (P1)

1. Add capture progress, cancel, meaningful empty/error/retry states and clear labels for unsupported visuals.
2. Keyboard navigation, focus states, readable contrast, screen-reader names, and responsive preview.
3. Confirm preview lifecycle/expiration and storage cleanup; no background upload, no unsafe DOM injection, minimum permissions.
4. Provide accessible localized copy where justified by Persian/Arabic acceptance testing.
5. Package extension icons, onboarding, help/troubleshooting, export sample fixtures, and privacy documentation.

**Gate:** keyboard-only smoke test and privacy checklist pass; UX makes export completeness and warnings visible.

### Phase 7 — release and maintenance (P0 release gate)

1. Produce a clean installable ZIP with only runtime files; pin/review dependencies and automate package validation.
2. Test fresh install and update, current Chrome stable, extension popup on/off ChatGPT, and release from a clean checkout.
3. Record release notes, known limitations, sample output, version bump, license and Chrome Web Store submission metadata.
4. Set release regression policy: PR checks and at least one manual live ChatGPT test per tagged release; document selector maintenance.

**Gate:** release candidate passes the Definition of Done below and is installable independently of the source folder. A published store listing is optional for a source-distributed v1 but required before claiming a store release.

## Immediate execution order

1. **Merged PRs #5–#7:** visual-only replies, message identity/capture warnings, and reproducible ZIP packaging.
2. **Merged PR #8:** opt-in bounded long-chat scrolling, snapshots, progress/cancel and incomplete-scan disclosure; still experimental pending live QA.
3. **Merged PR #9:** editable Markdown lists, code fences and text escaping.
4. **Merged PR #10:** best-effort origin-clean loaded-image embedding for offline HTML.
5. **Merged PR #11:** print/PDF pagination, A4/Letter selection, warning propagation into HTML/Markdown, and long-document PDF regression checks.
6. **Current PR:** isolate multi-format download failures, distinguish started downloads from completed downloads, preserve the PDF print path, and recover from failed temporary-data cleanup.
7. **Done, PR #12 merged:** independent per-format downloads, truthful start/error reporting, and safer cleanup errors.
8. **Current PR:** keyboard/screen-reader improvements: empty message states, accessible labels, focus rings, scan busy/cancel, preview skip link.
9. **Done, PR #13 merged:** keyboard navigation, message empty states, screen-reader labels, scan cancellation and preview skip link.
10. **Current PR:** allowlist only capture-adapter CSS, prevent style-based document overlays, add CSP/referrer controls to standalone HTML, and test both sanitized and unsafe input.
11. **Done, PR #14 merged:** strict allowed CSS in exports, no-script standalone HTML CSP, and no-referrer handling.
12. **Current PR:** make remote image requests opt-in in preview and downloadable HTML/Markdown, retaining JSON source data and embedded images.
13. **Afterward:** richer visual fallbacks, RTL fixtures and release preparation.
14. **Deferred human acceptance:** authenticate on current ChatGPT and complete issue #1; do not declare v1 production ready before this evidence exists.

Use narrow pull requests with regression tests where practical; merge only after CI and review. Update phase status after each merge, not when a feature is only proposed.

## Canonical document contract

```js
ExportDocument = {
  version: 1,
  title: string,
  sourceUrl: string,
  exportedAt: string,   // ISO 8601
  warnings: string[],
  messages: [{
    id: string,
    role: "assistant" | "user",
    text: string,
    html: string,
    warnings: string[]
  }]
}
```

Only introduce a `version: 2` schema with backwards-compatibility notes, migration strategy, and tests.

## Cross-cutting risks and decisions

- **DOM volatility:** ChatGPT selectors, nesting, and virtualized rendering change; tests against mocked DOM do not prove live compatibility.
- **Selectable vs exact:** screenshots maximize appearance but lose native editing/search; prioritize semantic text and disclose raster-only regions.
- **Network/canvas restrictions:** external images, CORS-tainted canvas, embedded iframes and protected media cannot always be exported offline.
- **File safety:** treat captured content as untrusted HTML; never execute embedded scripts or expose a remote conversion endpoint.
- **RTL quality:** test mixed-direction paragraphs, numbers, punctuation, fonts, lists, tables, and links—not just simple Persian words.
- **Scope control:** a secure, truthful, well-tested v1 is better than advertising pixel-perfect output without supporting evidence.

## Definition of Done for v1.0

- [ ] Complete issue #1 on live ChatGPT and document screenshots/observations without sharing private conversations.
- [ ] All advertised export choices work; no chosen format is silently skipped.
- [ ] Missing/unsupported turns or media are flagged, not hidden.
- [ ] HTML/Markdown/JSON correct for headings, code, links, lists, standard tables, Persian/Arabic/English fixtures.
- [ ] HTML sanitized; private content stays local; minimum extension permissions documented.
- [ ] Searchable/printable PDF validated using native Chrome Save as PDF; one-click PDF not advertised unless implemented.
- [ ] Long-chat and visual regression cases run or clearly scoped/documented limitations are accepted.
- [ ] CI green, clean install passes, version/README/privacy/release package reviewed.
