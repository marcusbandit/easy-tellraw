# Dialogue Format Cheat Sheet

Keep this open while writing dialogue files.

## File Layout

- Start optional styles block:
  @styles
  speaker Jordan color=#56C0FF
  button.primary color=#2D6CDF
  @endstyles

- Define nodes with `@node_name` and write lines until the next node.

### Dialogue Lines

- Basic: `Speaker: text`
- Per-line style: `Speaker{color=#FFD700 bold}: styled text`

Inline styling inside text:

- `{italic}text{/}`
- `{bold}text{/}`
- `{color=#HEX}text{/}`

### Buttons

- Jump to node: `[Yes -> @next_node]`
- Call function: `[Open Map -> ui:map/open]`

Button style overrides (after the button):

- `[Yes -> @next]{class=primary}`
- `[Open -> ui:map/open]{color=#00FFC8 bold}`

### Tags (optional)

Place a tags line within a node: `#intro #gate`

### Notes

- `@name` is only for node jumps. Other targets are treated as function calls.
- Styles in `@styles` are defaults; per-line or per-button overrides take precedence.
