export interface SpeakerStyle {
  color?: string;
}

export interface ButtonStyle {
  color?: string;
}

export interface DialogueStyles {
  speakers: Record<string, SpeakerStyle>;
  buttons: Record<string, ButtonStyle>;
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
}

export interface DialogueLine {
  speaker?: string; // optional for standalone choices
  text: string;
  choices: DialogueChoice[];
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


