export interface CharacterSubStyle {
  color?: string;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  strikethrough?: boolean;
}

export interface SpeakerStyle {
  // Preferred nested styles
  name?: CharacterSubStyle;
  text?: CharacterSubStyle;
  // Backward-compat (legacy flat text style)
  color?: string;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  strikethrough?: boolean;
}

export interface ButtonStyle {
  color?: string;
  label?: string; // default label for this preset
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  strikethrough?: boolean;
}

export interface DialogueStyles {
  speakers: Record<string, SpeakerStyle>;
  buttons: Record<string, ButtonStyle>;
  styles?: Record<string, CharacterSubStyle>; // named styles: style.<name>
}

export interface DialogueChoice {
  text: string;
  target: string; // '@label' or external like 'ui:map/open'
  className?: string; // e.g., 'primary', 'danger'
  color?: string;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  strikethrough?: boolean;
  // When label was {button.xxx}, text is cleared and className holds 'xxx'
}

export interface DialogueLine {
  speaker?: string; // optional for standalone choices
  text: string;
  choices: DialogueChoice[];
  // Render the speaker name prefix on this line only when true
  showSpeakerLabel?: boolean;
  // Optional inline runs with per-segment overrides for text formatting
  runs?: Array<{
    text: string;
    color?: string;
    bold?: boolean;
    italic?: boolean;
    underline?: boolean;
    strikethrough?: boolean;
  }>;
  style?: {
    color?: string;
    bold?: boolean;
    italic?: boolean;
    underline?: boolean;
    strikethrough?: boolean;
  };
}

export interface DialogueScene {
  id: string; // label without '@'
  tags: string[];
  lines: DialogueLine[];
}

export interface DialogueGraph {
  styles: DialogueStyles;
  scenes: Record<string, DialogueScene>;
}


