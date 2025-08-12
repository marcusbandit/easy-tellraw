# Stylized Tellraw Editor (Easy Tellraw)

React + Electron editor for crafting Minecraft /tellraw JSON with live preview, rich-text styling, click/hover actions, and an optional dialogue graph workflow.

## Highlights

- **Rich text editor**: Bold, italic, underline, strikethrough, obfuscated; custom colors; selection-aware editing.
- **Actions**: Configure click events (run/suggest command, open URL, copy to clipboard) and hover text per segment or selection.
- **Live Tellraw output**: Pretty/compact views, target selector (`@p`, `@s`, `@a`), and segment highlighting in JSON.
- **Import**: Paste a full `/tellraw` command or just the JSON array; auto-detects selector and updates UI.
- **Dialogue**: Import a plain-text dialogue file to visualize/edit via an interactive graph.
- **Electron**: Native file dialog, optional file watching for hot-reload of dialogue files.

### Screens and Workflow

- **Editor tab**
  - Type in the main area; use keyboard shortcuts or the Actions panel to style and attach events.
  - The output panel shows the live command. Toggle Collapse/Expand for compact vs pretty JSON.
  - Use the target selector to switch the command target dynamically.
  - Buttons: Import Tellraw Command (with JSON syntax highlighting), Copy Tellraw Command, Reset Tellraw.
- **Graph tab**
  - The enhanced conversation graph (`EnhancedConversationGraph`) is used for visualization.

### Dialogue Format

Keep the cheat sheet handy while writing dialogue files:

- See `docs/Dialogue-Cheat-Sheet.md` for the full spec.
- Core ideas:
  - Optional `@styles` block for defaults (speakers, button classes).
  - Nodes declared with `@node_name`; lines until the next node.
  - Buttons like `[Yes -> @next_node]` or `[Open Map -> ui:map/open]` with optional style overrides.
  - Inline text styling: `{bold}text{/}`, `{italic}text{/}`, `{color=#HEX}text{/}`.

### Keyboard Shortcuts

- Ctrl+B: bold
- Ctrl+I: italic
- Ctrl+U: underline
- Ctrl+Shift+S: strikethrough
- Ctrl+Shift+O: obfuscated
- Double-click: select word; Triple-click: select entire line

### Color Mapping Notes

The JSON preview replaces common hex codes with Minecraft color names when possible (e.g., `#ffaa00` → `gold`).

### Scripts

Defined in `package.json`:

- `start`: Runs CRA dev server and Electron together (via `concurrently`).
- `react-start`: Runs CRA dev server (browser-only).
- `build`: Builds the React app (CRA).
- `dist`: Packages the Electron app (electron-builder: Windows NSIS/zip; Linux AppImage/deb).
- `test`: Runs CRA tests.
- `eject`: Ejects CRA config.

### Tech Stack

- React 18, TypeScript
- Slate.js for rich text (`slate`, `slate-react`, `slate-history`)
- Radix UI (`@radix-ui/themes`, `@radix-ui/react-*`)
- Electron + electron-builder
- PrismJS for JSON highlighting
- React Flow for graphs

### Project Structure (select files)

- `src/App.tsx`: App shell; editor/graph tabs; import handlers; state wiring.
- `src/components/EditorContainer.tsx`: Slate editor, import dialog, output panel, copy/reset.
- `src/components/ActionsPanel.tsx`: Click/hover action controls bound to selection/segments.
- `src/components/JsonOutput.tsx`: Live Tellraw string with syntax highlighting and target selector.
- `src/hooks/useTellrawSegments.ts`: Parses Slate value into Tellraw segments and paths.
- `src/components/ui/EnhancedConversationGraph.tsx`: Conversation Graph UI.
- `docs/Dialogue-Cheat-Sheet.md`: Dialogue authoring reference.

### Electron Notes

- File import uses IPC (`open-file-dialog`, `read-file`).
- Dialogue files can be watched for changes (`watch-file`/`unwatch-file`), enabling hot reload.
- In browsers, a hidden `<input type="file">` is used as a fallback.

### Presets

- Example function files live under `public/presets/`.

### Disclaimer

This project started on Create React App, but the README reflects the current Electron + Slate + Radix toolchain and custom features for Tellraw authoring and dialogue graphs.
