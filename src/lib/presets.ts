export interface PresetParameter {
  name: string;
  description: string;
}

export interface Preset {
  id: string;
  name: string;
  category: string;
  description: string;
  parameters: PresetParameter[];
  template: string;
}

// Preloaded presets for the editor
export const presets: Preset[] = [
  {
    id: '2_choice_buttons',
    name: '2 Choice Buttons',
    category: 'UI Controls',
    description: 'Displays a prompt with two clickable choice buttons.',
    parameters: [
      { name: 'text', description: 'The prompt text.' },
      { name: 'text_color', description: 'Hex color code for the main text.' },
      { name: 'button1_text', description: 'Label for the first button.' },
      { name: 'button1_color', description: 'Hex color code for the first button.' },
      { name: 'button1_command', description: 'Function to run when the first button is clicked.' },
      { name: 'button2_text', description: 'Label for the second button.' },
      { name: 'button2_color', description: 'Hex color code for the second button.' },
      { name: 'button2_command', description: 'Function to run when the second button is clicked.' },
    ],
    template: `# Preset: 2 Choice Buttons
# text: The prompt text.
# text_color: Hex color code for the main text.
# button1_text: Label for the first button.
# button1_color: Hex color code for the first button.
# button1_command: Function to run when the first button is clicked.
# button2_text: Label for the second button.
# button2_color: Hex color code for the second button.
# button2_command: Function to run when the second button is clicked.
$tellraw @s [{"text":"$(text) ","color":"$(text_color)"},{"text":"[$(button1_text)]","color":"$(button1_color)","click_event":{"action":"run_command","command":"$(button1_command)"}},{"text":" ","color":"$(text_color)"},{"text":"[$(button2_text)]","color":"$(button2_color)","click_event":{"action":"run_command","command":"$(button2_command)"}}]`,
  },
]; 