export type ClickAction = 'run_command' | 'suggest_command' | 'copy_to_clipboard' | 'open_url';

export type ClickEvent =
  | { action: 'run_command'; command: string }
  | { action: 'suggest_command'; command: string }
  | { action: 'copy_to_clipboard'; value: string }
  | { action: 'open_url'; url: string };

export interface HoverEvent {
  value?: string;
  text?: string;
}

export interface TellrawSegment {
  text: string;
  color?: string;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  strikethrough?: boolean;
  obfuscated?: boolean;
  click_event?: ClickEvent | null;
  hover_event?: HoverEvent | null;
}

export type TellrawSegments = Array<TellrawSegment | string>; // allow "\n" entries


