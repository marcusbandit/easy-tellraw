import { DialogueGraph, DialogueScene, DialogueStyles, DialogueLine, DialogueChoice, SpeakerStyle } from '../types/dialogue';

const STYLE_SECTION_START = /^@styles\s*$/i;
const STYLE_SECTION_END = /^@endstyles\s*$/i;
const SCENE_START = /^@([A-Za-z0-9_-]+)\s*$/;

// Legacy styles inside @styles ... @endstyles
// Matches e.g. "speaker Jordan color=#56C0FF" or "button.primary color=#2D6CDF"
const STYLE_LINE = /^(speaker\s+([A-Za-z0-9_-]+)|button\.([A-Za-z0-9_-]+))\s+color=([#A-Fa-f0-9]{3,8})\s*$/;

// New RAW styles format (outside or inside styles):
// character.1 name=Jordan name_color=#b6a02F text_color=#56C0FF text_bold=true
// button.1 label=default color=#333333 bold=true
// style.primary color=#ff00ff bold=true italic=true
const CHARACTER_STYLE_NUM_LINE = /^character\.(\d+)\s+(.+)$/i;
const CHARACTER_STYLE_NAME_LINE = /^character\.([A-Za-z0-9_-]+)\s+(.+)$/i;
const BUTTON_STYLE_NUM_LINE = /^button\.(\d+)\s+(.+)$/i;
const BUTTON_STYLE_NAME_LINE = /^button\.([A-Za-z0-9_-]+)\s+(.+)$/i;
const NAMED_STYLE_LINE = /^style\.([A-Za-z0-9_-]+)\s+(.+)$/i;

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
const TAGS_LINE = /^(?:#[A-Za-z0-9_-]+\s*)+$/;

// Matches a dialogue line like "Jordan: Hello ..." or with inline style after speaker
// e.g., "Jordan{color=#FFD700 bold}: ..."
const DIALOGUE_PREFIX = /^([A-Za-z0-9_-]+)(\{[^}]*\})?\s*:\s*(.*)$/;

// Matches a choice like "[Yes -> @save_kara]{class=primary color=#FF0000 bold}"
const CHOICE_WITH_META = /\[([^\]]+?)\s*->\s*([^\]]+?)\](?:\{([^}]*)\})?/g;

// Matches inline style blocks like {italic}text{/}, {italic=false}text{/}, {color=#ff00ff bold}text{/}
const INLINE_BLOCK = /\{([^}]+)\}([\s\S]*?)\{\/\}/g;

export function parseDialogue(source: string): DialogueGraph {
  const lines = source.split(/\r?\n/);
  const styles: DialogueStyles = { speakers: {}, buttons: {} };
  const scenes: Record<string, DialogueScene> = {};

  let inStyles = false;
  let currentScene: DialogueScene | null = null;
  // Tracks the currently active character set by {character.Name} markers
  let activeSpeaker: string | null = null;

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
    if ((mm = line.match(CHARACTER_STYLE_NAME_LINE))) {
      const props = parseKeyValueProps(mm[2]);
      const name = mm[1] || props['name'];
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
    if ((mm = line.match(CHARACTER_STYLE_NUM_LINE))) {
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
    if ((mm = line.match(BUTTON_STYLE_NAME_LINE))) {
      const props = parseKeyValueProps(mm[2]);
      const id = mm[1];
      const label = props['label'] || id;
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
    if ((mm = line.match(BUTTON_STYLE_NUM_LINE))) {
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
    if ((mm = line.match(NAMED_STYLE_LINE))) {
      const name = mm[1];
      const props = parseKeyValueProps(mm[2]);
      const cur: any = (styles as any).styles?.[name] || {};
      if (!styles.styles) (styles as any).styles = {};
      if (props['color']) cur.color = props['color'];
      if (props['bold'] === 'true') cur.bold = true;
      if (props['italic'] === 'true') cur.italic = true;
      if (props['underline'] === 'true') cur.underline = true;
      if (props['strikethrough'] === 'true') cur.strikethrough = true;
      (styles as any).styles[name] = cur;
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

    // Parse dialogue content, which may include choices and character markers
    let speaker: string | undefined;
    let textPart = line;
    const pref = line.match(DIALOGUE_PREFIX);
    let lineStyle: DialogueLine['style'] | undefined;
    let showSpeakerLabel = false;
    if (pref) {
      // Explicit speaker for this line via "Name: text" format
      speaker = pref[1];
      const brace = pref[2];
      textPart = pref[3];
      if (brace) {
        const styleText = brace.slice(1, -1);
        const colorMatch = /color\s*=\s*([#A-Fa-f0-9]{3,8})/.exec(styleText);
        const ls: any = {};
        if (colorMatch?.[1]) ls.color = colorMatch[1];
        if (/(?:^|\s)bold(?:\s|$)/.test(styleText)) ls.bold = true;
        if (/(?:^|\s)italic(?:\s|$)/.test(styleText)) ls.italic = true;
        if (/(?:^|\s)underline(?:\s|$)/.test(styleText)) ls.underline = true;
        if (/(?:^|\s)strikethrough(?:\s|$)/.test(styleText)) ls.strikethrough = true;
        lineStyle = ls;
      }
      // Update active speaker to explicit one for subsequent lines
      activeSpeaker = speaker;
      showSpeakerLabel = true;
    } else {
      // When no explicit speaker, support inline markers: {character.Name}
      // Protect escaped braces first
      const ESC_L = "\u0001";
      const ESC_R = "\u0002";
      const preProtected = textPart
        .replace(/\\\{/g, ESC_L)
        .replace(/\\\}/g, ESC_R);
      // Extract unescaped character markers and update activeSpeaker
      let modified = preProtected;
      const markerRegex = /\{character\.([A-Za-z0-9_-]+)\}/g;
      let m: RegExpExecArray | null;
      let lastFoundSpeaker: string | null = null;
      let hadMarker = false;
      while ((m = markerRegex.exec(preProtected)) !== null) {
        lastFoundSpeaker = m[1];
        hadMarker = true;
      }
      if (lastFoundSpeaker) activeSpeaker = lastFoundSpeaker;
      // Remove all marker tokens from visible text
      modified = modified.replace(markerRegex, '');
      // Restore escaped braces back to literals
      textPart = modified
        .replace(new RegExp(ESC_L, 'g'), '{')
        .replace(new RegExp(ESC_R, 'g'), '}');
      // If active speaker is set, use it as the speaker for this line
      if (activeSpeaker) speaker = activeSpeaker;
      // Show label when a marker appeared on this line
      showSpeakerLabel = !!(hadMarker && speaker);
    }

    const choices: DialogueChoice[] = [];
    let message = textPart;

    // extract choices with optional metadata
    message = message.replace(CHOICE_WITH_META, (_, label: string, target: string, meta: string | undefined) => {
      const rawLabel = label.trim();
      const choice: DialogueChoice = { text: rawLabel, target: target.trim() };
      if (meta) {
        const colorMatch = /(?:^|\s)color\s*=\s*([#A-Fa-f0-9]{3,8})/.exec(meta);
        const classMatch = /(?:^|\s)class\s*=\s*([A-Za-z0-9_-]+)/.exec(meta);
        const styleMatch = /(?:^|\s)style\s*=\s*([A-Za-z0-9_-]+)/.exec(meta);
        if (colorMatch?.[1]) choice.color = colorMatch[1];
        if (classMatch) choice.className = classMatch[1];
        if (/(?:^|\s)bold(?:\s|$)/.test(meta)) choice.bold = true;
        if (/(?:^|\s)italic(?:\s|$)/.test(meta)) choice.italic = true;
        if (/(?:^|\s)underline(?:\s|$)/.test(meta)) choice.underline = true;
        if (/(?:^|\s)strikethrough(?:\s|$)/.test(meta)) choice.strikethrough = true;
        // Apply named style defaults for any unspecified fields
        if (styleMatch) {
          const styleName = styleMatch[1];
          const named: any = (styles as any).styles?.[styleName];
          if (named && typeof named === 'object') {
            if (choice.color === undefined && named.color) choice.color = named.color;
            if (choice.bold === undefined && typeof named.bold === 'boolean') choice.bold = !!named.bold;
            if (choice.italic === undefined && typeof named.italic === 'boolean') choice.italic = !!named.italic;
            if (choice.underline === undefined && typeof named.underline === 'boolean') choice.underline = !!named.underline;
            if (choice.strikethrough === undefined && typeof named.strikethrough === 'boolean') choice.strikethrough = !!named.strikethrough;
          }
        }
      }
      // If label is a button reference like {button.primary}, use that button style and hide raw token
      const labelRef = rawLabel.match(/^\{button\.([A-Za-z0-9_-]+)\}$/);
      if (labelRef) {
        const btnName = labelRef[1];
        if (!choice.className) choice.className = btnName;
        // Defer final label resolution to renderer (uses styles.buttons[btnName].label or btnName)
        choice.text = '';
      }
      choices.push(choice);
      return ''; // remove from message
    }).trim();

    // Parse inline blocks into runs while preserving plain text
    const runs: DialogueLine['runs'] = [];
    const baseRunStyle: any = {};
    if (lineStyle?.color) baseRunStyle.color = lineStyle.color;
    if (typeof lineStyle?.bold === 'boolean') baseRunStyle.bold = lineStyle.bold;
    if (typeof lineStyle?.italic === 'boolean') baseRunStyle.italic = lineStyle.italic;
    if (typeof lineStyle?.underline === 'boolean') baseRunStyle.underline = lineStyle.underline;
    if (typeof lineStyle?.strikethrough === 'boolean') baseRunStyle.strikethrough = lineStyle.strikethrough;
    let lastIndex = 0; let ib: RegExpExecArray | null;
    while ((ib = INLINE_BLOCK.exec(message)) !== null) {
      const before = message.slice(lastIndex, ib.index);
      if (before) runs.push({ text: before, ...baseRunStyle });
      lastIndex = ib.index + ib[0].length;
      const props = ib[1];
      const content = ib[2];
      const seg: any = { text: content };
      let styleName: string | null = null;
      props.trim().split(/\s+/).forEach(tok => {
        if (!tok) return;
        const eq = tok.indexOf('=');
        let key = tok;
        let value: string | boolean = true;
        if (eq > 0) {
          key = tok.slice(0, eq).trim();
          const raw = tok.slice(eq + 1).trim();
          if (raw === 'true') value = true; else if (raw === 'false') value = false; else value = raw;
        }
        switch (key) {
          case 'bold': seg.bold = !!value; break;
          case 'italic': seg.italic = !!value; break;
          case 'underline': seg.underline = !!value; break;
          case 'strikethrough': seg.strikethrough = !!value; break;
          case 'color': if (typeof value === 'string') seg.color = value; break;
          case 'style': if (typeof value === 'string') styleName = value; break;
        }
      });
      if (styleName) {
        const named: any = (styles as any).styles?.[styleName];
        if (named && typeof named === 'object') {
          if (seg.color === undefined && named.color) seg.color = named.color;
          if (seg.bold === undefined && typeof named.bold === 'boolean') seg.bold = !!named.bold;
          if (seg.italic === undefined && typeof named.italic === 'boolean') seg.italic = !!named.italic;
          if (seg.underline === undefined && typeof named.underline === 'boolean') seg.underline = !!named.underline;
          if (seg.strikethrough === undefined && typeof named.strikethrough === 'boolean') seg.strikethrough = !!named.strikethrough;
        }
      }
      runs.push(seg);
    }
    const tail = message.slice(lastIndex);
    if (tail) runs.push({ text: tail, ...baseRunStyle });
    const plain = message.replace(INLINE_BLOCK, '$2');

    const dialogueLine: DialogueLine = { speaker, text: plain, runs, choices, style: lineStyle, showSpeakerLabel };
    currentScene.lines.push(dialogueLine);
  }

  return { styles, scenes };
}


