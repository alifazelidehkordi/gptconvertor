# Browser smoke tests (manual)

1. Open chrome://extensions and enable Developer mode.
2. Load unpacked and select the repository root (the folder with manifest.json).
3. Visit a chatgpt.com conversation and click GPT Convertor.
4. Check that Assistant replies only is selected and user prompts are hidden.
5. Select/deselect individual replies, then include user messages via the toggle.
6. Select all four formats and click Preview & export.
7. Check the preview for text, inline code, lists, tables, images, SVGs and Persian/English layout.
8. Click Download selected formats; check .html, .md, .json downloads.
9. Chrome's print dialog should appear for PDF: set Destination -> Save as PDF, and save.
10. Search/select text in PDF. Edit Markdown in any plain-text editor. Open HTML offline.
11. Try a long/virtualized chat, canvas, iframe, maps and heavy visual cards; note limitations.
12. Use Clear saved preview and check that the temp job is no longer available.

Status: source and automated checks are available. Real-browser smoke tests have not yet been attested.
