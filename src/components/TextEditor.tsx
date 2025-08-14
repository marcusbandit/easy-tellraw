import React from 'react';

export const initialValue: any[] = [
  { type: 'paragraph', children: [{ text: '' }] }
];

export const Leaf = ({ attributes, children, leaf }: any) => {
  let el;
  if (leaf.obfuscated) {
    const text: string = leaf.text || '';
    el = <>{text.split('').map(() => '*').join('')}</>;
  } else {
    el = <>{children}</>;
    if (leaf.bold) el = <strong>{el}</strong>;
    if (leaf.italic) el = <em>{el}</em>;
    if (leaf.strikethrough) el = <s>{el}</s>;
    if (leaf.underline) el = <u>{el}</u>;
  }
  const leafStyle: React.CSSProperties = { lineHeight: 1 };
  if (leaf.color) leafStyle.color = leaf.color;
  // Apply decoration-based highlighting or click-event highlight
  if (leaf.highlight) {
    leafStyle.backgroundColor = 'rgba(70, 218, 193, 0.22)';
  } else if (leaf.click_event) {
    leafStyle.backgroundColor = 'rgba(255, 145, 0, 0.14)';
  }
  return (
    <span {...attributes} style={leafStyle}>
      {el}
    </span>
  );
}; 