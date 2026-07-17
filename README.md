# Book PDF Viewer (Firefox Extension)

Opens PDFs as a flip-able book (two-page spread, real page-turn animation)
instead of Firefox's default vertical scrolling PDF viewer.

## Install (temporary, for testing)

1. Open Firefox and go to `about:debugging#/runtime/this-firefox`
2. Click **Load Temporary Add-on…**
3. Select the `manifest.json` file inside this folder
4. That's it — the extension is now active until you restart Firefox

## Install (permanent, for yourself)

Firefox requires extensions to be signed to stay installed permanently.
To self-sign for personal use:

1. Zip the contents of this folder (not the folder itself) into `book-pdf-viewer.zip`
2. Go to https://addons.mozilla.org/developers/ and create a free developer account
3. Submit the zip as an **unlisted** add-on — Mozilla signs it automatically,
   usually within a few minutes
4. Download the signed `.xpi` it gives you and drag it into Firefox to install permanently

(This signing step is a Firefox requirement for all extensions, not something
specific to this one.)

## How to use it

- **Automatic**: navigate to any PDF URL in the browser (or a link that opens
  a PDF inline) — it will open in the book viewer automatically.
- **Manual**: click the extension's toolbar icon (📖) to paste a PDF URL or
  pick a local PDF file from your computer.

## Controls

- `←` / `→` arrow keys, or the on-screen `‹` `›` buttons, turn pages
- Click-and-drag a page corner to flip it like a real book
- Type a page number in the box to jump straight there
- `+` / `–` zoom the book in and out
- ⛶ toggles fullscreen

## Licensing

This extension bundles Mozilla's PDF.js library (Apache License 2.0),
unmodified. See `THIRD_PARTY_LICENSES.md` for details.

## Notes

- Very large PDFs (hundreds of pages) will take a few seconds to render
  before the book opens, since each page is rasterized up front.
- If a site forces PDFs to download instead of displaying inline
  (`Content-Disposition: attachment`), the browser's normal download
  behavior is left untouched — this extension only intercepts PDFs that
  were going to be *displayed*.