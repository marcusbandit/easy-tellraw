import { DialogueGraph, DialogueScene, DialogueStyles, DialogueLine, DialogueChoice } from '../types/dialogue';

const STYLE_SECTION_START = /^@styles\s*$/i;
const STYLE_SECTION_END = /^@endstyles\s*$/i;
const SCENE_START = /^@([A-Za-z0-9_\-]+)\s*$/;

// Matches e.g. "speaker Jordan color=#56C0FF" or "button.primary color=#2D6CDF"
const STYLE_LINE = /^(speaker\s+([A-Za-z0-9_\-]+)|button\.([A-Za-z0-9_\-]+))\s+color=([#A-Fa-f0-9]{3,8})\s*$/;

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

    if (inStyles) {
      const m = line.match(STYLE_LINE);
      if (m) {
        const speakerName = m[2];
        const buttonClass = m[3];
        const color = m[4];
        if (speakerName) styles.speakers[speakerName] = { color };
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


