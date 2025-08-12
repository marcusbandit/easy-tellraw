# TODO

This file outlines the next steps for implementing the preset system, UI, and export features.

## Presets System

- [ ] Scaffold `data/<namespace>/function/presets` folder with sample `.mcfunction` files
- [ ] Create `src/lib/presets.ts` definitions (done for sample preset)
- [ ] Implement parser to load `.mcfunction` templates and extract parameter metadata
- [ ] Wire up preset templates to UI for parameter editing and injection

## Sidebar & UI

- [ ] Extend `Sidebar.tsx` to display preset categories and searchable list
- [ ] Show preset description and parameter form when expanded
- [ ] Add "+" button to add a preset node into the graph
- [ ] Add "←|" button to override current Slate editor content with a preset

## Graph Editor

- [ ] Scaffold `GraphEditor.tsx` under `src/components/ui` with React Flow
- [ ] Render nodes from presets and user-created nodes, with dynamic handles for click events
- [ ] Allow connecting nodes via edges and labeling handles based on parameters

## Export & Datapack

- [ ] Generate `pack.mcmeta` with selected Minecraft version
- [ ] Output `data/<namespace>/function/conversations/<conversationName>/<nodeId>.mcfunction`
- [ ] Include `function <namespace>:presets/... { ... }` calls with JSON arguments
- [ ] Package into `.zip` download via JSZip

## Future Enhancements

- [ ] Add categories/tags for presets; support user-defined presets
- [ ] Swap localStorage for IndexedDB for large datasets
- [ ] Virtualize preset list for performance
- [ ] Add search/filter in the graph view
