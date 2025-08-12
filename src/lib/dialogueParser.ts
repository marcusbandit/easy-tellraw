import { DialogueGraph, DialogueScene, DialogueStyles, DialogueLine, DialogueChoice, SpeakerStyle } from '../types/dialogue';

const STYLE_SECTION_START = /^@styles\s*$/i;
const STYLE_SECTION_END = /^@endstyles\s*$/i;
const SCENE_START = /^@([A-Za-z0-9_\-]+)\s*$/;

// Legacy styles inside @styles ... @endstyles
// Matches e.g. "speaker Jordan color=#56C0FF" or "button.primary color=#2D6CDF"
const STYLE_LINE = /^(speaker\s+([A-Za-z0-9_\-]+)|button\.([A-Za-z0-9_\-]+))\s+color=([#A-Fa-f0-9]{3,8})\s*$/;

// New RAW styles format (outside or inside styles):
// character.1 name=Jordan name_color=#b6a02F text_color=#56C0FF text_bold=true
// button.1 label=default color=#333333 bold=true
const CHARACTER_STYLE_LINE = /^character\.(\d+)\s+(.+)$/i;
const BUTTON_STYLE_LINE = /^button\.(\d+)\s+(.+)$/i;

function parseKeyValueProps(props: string): Record<string, string> {
  const result: Record<string, string> = {};
  // split by spaces, key=value
  const parts = props.trim().split(/\s+/);
  for (const part of parts) {
    const eq = part.indexOf('=');
    if (eq > 0) {
      const key = part.slice(0, eq).trim();
      const value = part.slice(eq + 1).trim();
      result[key] = value;
    }
  }
  return result;
}

// Matches tags line like "#intro #gate"
const TAGS_LINE = /^(?:#[A-Za-z0-9_\-]+\s*)+$/;

// Matches a dialogue line like "Jordan: Hello ..." or with inline style after speaker
// e.g., "Jordan{color=#FFD700 bold}: ..."
const DIALOGUE_PREFIX = /^([A-Za-z0-9_\-]+)(\{[^}]*\})?\s*:\s*(.*)$/;

// Matches a choice like "[Yes -> @save_kara]{class=primary color=#FF0000 bold}"
const CHOICE_WITH_META = /\[([^\]]+?)\s*->\s*([^\]]+?)\](?:\{([^}]*)\})?/g;

// Matches inline style markers {italic}...{/}, {bold}...{/}
const INLINE_MARK = /\{(italic|bold)\}([\s\S]*?)\{\/\}\s*/g;

export function parseDialogue(source: string): DialogueGraph {
  const lines = source.split(/\r?\n/);
  const styles: DialogueStyles = { speakers: {}, buttons: {} };
  const scenes: Record<string, DialogueScene> = {};

  let inStyles = false;
  let currentScene: DialogueScene | null = null;

  const ensureScene = (id: string) => {
    if (!scenes[id]) scenes[id] = { id, tags: [], lines: [] };
    return scenes[id];
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;

    if (STYLE_SECTION_START.test(line)) { inStyles = true; continue; }
    if (STYLE_SECTION_END.test(line)) { inStyles = false; continue; }

    // New RAW style lines (load regardless of styles section)
    let mm: RegExpMatchArray | null;
    if ((mm = line.match(CHARACTER_STYLE_LINE))) {
      const props = parseKeyValueProps(mm[2]);
      const name = props['name'];
      if (name) {
        const style: any = styles.speakers[name] || {};
        const nameStyle: any = style.name || {};
        const textStyle: any = style.text || {};
        if (props['name_color']) nameStyle.color = props['name_color'];
        if (props['name_bold'] === 'true') nameStyle.bold = true;
        if (props['name_italic'] === 'true') nameStyle.italic = true;
        if (props['name_underline'] === 'true') nameStyle.underline = true;
        if (props['name_strikethrough'] === 'true') nameStyle.strikethrough = true;
        if (props['text_color']) textStyle.color = props['text_color'];
        if (props['text_bold'] === 'true') textStyle.bold = true;
        if (props['text_italic'] === 'true') textStyle.italic = true;
        if (props['text_underline'] === 'true') textStyle.underline = true;
        if (props['text_strikethrough'] === 'true') textStyle.strikethrough = true;
        const merged: SpeakerStyle = { name: nameStyle, text: textStyle } as any;
        styles.speakers[name] = merged;
      }
      continue;
    }
    if ((mm = line.match(BUTTON_STYLE_LINE))) {
      const props = parseKeyValueProps(mm[2]);
      const label = props['label'];
      const idx = mm[1];
      const id = label || `button_${idx}`;
      const cur: any = styles.buttons[id] || {};
      if (props['color']) cur.color = props['color'];
      if (props['bold'] === 'true') cur.bold = true;
      if (props['italic'] === 'true') cur.italic = true;
      if (props['underline'] === 'true') cur.underline = true;
      if (props['strikethrough'] === 'true') cur.strikethrough = true;
      if (label) cur.label = label;
      styles.buttons[id] = cur;
      continue;
    }

    if (inStyles) {
      const m = line.match(STYLE_LINE);
      if (m) {
        const speakerName = m[2];
        const buttonClass = m[3];
        const color = m[4];
        if (speakerName) styles.speakers[speakerName] = { color } as any;
        else if (buttonClass) styles.buttons[buttonClass] = { color };
      }
      continue;
    }

    const sceneMatch = line.match(SCENE_START);
    if (sceneMatch) {
      currentScene = ensureScene(sceneMatch[1]);
      continue;
    }

    if (!currentScene) {
      // allow tag lines at the top before first scene: treat as tags for implicit start scene
      currentScene = ensureScene('start');
    }

    if (TAGS_LINE.test(line)) {
      const tags = line.split(/\s+/).map(t => t.replace(/^#/, ''));
      currentScene.tags.push(...tags);
      continue;
    }

    // Parse dialogue content, which may include choices
    let speaker: string | undefined;
    let textPart = line;
    const pref = line.match(DIALOGUE_PREFIX);
    let lineStyle: DialogueLine['style'] | undefined;
    if (pref) {
      speaker = pref[1];
      const brace = pref[2];
      textPart = pref[3];
      if (brace) {
        const styleText = brace.slice(1, -1);
        const colorMatch = /color\s*=\s*([#A-Fa-f0-9]{3,8})/.exec(styleText);
        lineStyle = {
          color: colorMatch?.[1],
          bold: /(?:^|\s)bold(?:\s|$)/.test(styleText),
          italic: /(?:^|\s)italic(?:\s|$)/.test(styleText),
          underline: /(?:^|\s)underline(?:\s|$)/.test(styleText),
          strikethrough: /(?:^|\s)strikethrough(?:\s|$)/.test(styleText),
        };
      }
    }

    const choices: DialogueChoice[] = [];
    let message = textPart;

    // extract choices with optional metadata
    message = message.replace(CHOICE_WITH_META, (_, label: string, target: string, meta: string | undefined) => {
      const choice: DialogueChoice = { text: label.trim(), target: target.trim() };
      if (meta) {
        const colorMatch = /(?:^|\s)color\s*=\s*([#A-Fa-f0-9]{3,8})/.exec(meta);
        const classMatch = /(?:^|\s)class\s*=\s*([A-Za-z0-9_\-]+)/.exec(meta);
        choice.color = colorMatch?.[1];
        if (classMatch) choice.className = classMatch[1];
        choice.bold = /(?:^|\s)bold(?:\s|$)/.test(meta);
        choice.italic = /(?:^|\s)italic(?:\s|$)/.test(meta);
        choice.underline = /(?:^|\s)underline(?:\s|$)/.test(meta);
        choice.strikethrough = /(?:^|\s)strikethrough(?:\s|$)/.test(meta);
      }
      choices.push(choice);
      return ''; // remove from message
    }).trim();

    // strip inline marks, leaving plain text (could be extended later)
    message = message.replace(INLINE_MARK, '$2');

    const dialogueLine: DialogueLine = { speaker, text: message, choices, style: lineStyle };
    currentScene.lines.push(dialogueLine);
  }

  return { styles, scenes };
}


