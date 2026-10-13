# Browser smoke tests (manual)

1. Open chrome://extensions and enable Developer mode.
2. Load unpacked and select the repository root (the folder with manifest.json).
3. Visit a chatgpt.com conversation and click GPT Convertor.
4. Check that Assistant replies only is selected and user prompts are hidden.
5. Select/deselect individual replies, then include user messages via the toggle.
6. Select all four formats and click Preview & export.
7. Check the preview for text, inline code, lists, tables (including colspan/rowspan), images, SVGs and Persian/English layout.
8. Check assistant replies containing only an image/SVG, and confirm they are listed, selectable and exported.
9. Check that downloaded HTML preserves merged cells and the rendered size of captured charts/images.
10. Click Download selected formats; check .html, .md, .json downloads.
11. Chrome's print dialog should appear for PDF: set Destination -> Save as PDF, and save.
12. Search/select text in PDF. Edit Markdown in any plain-text editor. Open HTML offline.
13. Try a long/virtualized chat, canvas, iframe, maps and heavy visual cards; note limitations.
14. Use Clear saved preview and check that the temp job is no longer available.

Additional reliability checks:
- Open the popup, select a later answer, then insert/change an earlier turn in the page. Export must keep the intended answer or warn that it changed.
- Edit the end of a long answer after scanning (the first 80 characters unchanged). The old selection must not silently export the edited turn.
- Select multiple turns, then remove one before export. Preview must prominently show the number missing and the affected message IDs in capture notes.
- Navigate to another conversation after opening the popup; export must stop with a clear rescan error.
- Test two identical replies and nested role wrappers: show and export both only once each.
- A longer conversation that virtualizes messages still needs separate manual validation; these identity tests do not guarantee complete offscreen capture.

Offline image QA (for later live-site sign-off):
- Capture already-loaded same-origin images and check exported HTML opens with those embedded images offline.
- Capture cross-origin, unavailable, and oversized images. Verify external URLs and per-message warnings rather than silent image loss.
- Confirm visual snapshot capture still respects per-turn memory ceilings and does not fetch new image URLs.

Long-conversation scan QA (when live-site testing resumes):
- Open a long conversation near the middle. Click **Scan entire conversation** and observe progress; confirm the original scroll offset is restored.
- Select an early message no longer in the DOM and export: it should appear with a cached-snapshot warning.
- Cancel a scan and confirm "incomplete" is displayed; export should still include captured items with incomplete-scan warning.
- Exercise step/message/size caps; incomplete scans must never imply full coverage.
- Check duplicates far apart and lazy-loaded historical turns; document ambiguities or missing results rather than marking full coverage.
- Navigate to another conversation during scanning: the old scan must not be exported.
- Verify normal "rendered messages" scanning/export remains unchanged when the optional full scan is not clicked.

Status: source and automated checks are available. Real-browser authenticated smoke tests have not yet been attested.
