# Preset: 2 Choice Buttons
# text: The prompt text.
# text_color: Hex color code for the main text.
# button1_text: Label for the first button.
# button1_color: Hex color code for the first button.
# button1_command: Function to run when the first button is clicked.
# button2_text: Label for the second button.
# button2_color: Hex color code for the second button.
# button2_command: Function to run when the second button is clicked.
$tellraw @s [{"text":"$(text) ","color":"$(text_color)"},{"text":"[$(button1_text)]","color":"$(button1_color)","click_event":{"action":"run_command","command":"$(button1_command)"}},{"text":" ","color":"$(text_color)"},{"text":"[$(button2_text)]","color":"$(button2_color)","click_event":{"action":"run_command","command":"$(button2_command)"}}] 