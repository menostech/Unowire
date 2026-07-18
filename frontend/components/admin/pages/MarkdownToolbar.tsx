'use client';

import { Bold, Italic, Heading1, Heading2, Link as LinkIcon, Image } from 'lucide-react';

interface MarkdownToolbarProps {
  textareaRef: React.RefObject<HTMLTextAreaElement | null>;
  value: string;
  onChange: (value: string) => void;
  onInsertImage: () => void;
}

/**
 * Insert text at the cursor position, optionally wrapping the current selection.
 * If `wrap` is true, `before` and `after` wrap the selection.
 * If `wrap` is false, `before` is inserted at the start of the current line.
 */
function insertAtCursor(
  textarea: HTMLTextAreaElement,
  before: string,
  after: string = '',
  wrap: boolean = true,
  placeholder: string = ''
): string {
  const start = textarea.selectionStart;
  const end = textarea.selectionEnd;
  const value = textarea.value;
  const selected = value.slice(start, end);
  const insertText = wrap
    ? `${before}${selected || placeholder}${after}`
    : `${before}${value.slice(start, end)}`;
  const newValue = wrap
    ? value.slice(0, start) + insertText + value.slice(end)
    : value.slice(0, start) + before + value.slice(end);
  // Restore cursor/selection
  requestAnimationFrame(() => {
    textarea.focus();
    if (wrap) {
      const newStart = start + before.length;
      const newEnd = newStart + (selected || placeholder).length;
      textarea.setSelectionRange(newStart, newEnd);
    } else {
      textarea.setSelectionRange(start + before.length, start + before.length);
    }
  });
  return newValue;
}

function prependLine(
  textarea: HTMLTextAreaElement,
  prefix: string
): string {
  const start = textarea.selectionStart;
  const value = textarea.value;
  // Find start of current line
  const lineStart = value.lastIndexOf('\n', start - 1) + 1;
  const newValue = value.slice(0, lineStart) + prefix + value.slice(lineStart);
  requestAnimationFrame(() => {
    textarea.focus();
    textarea.setSelectionRange(start + prefix.length, start + prefix.length);
  });
  return newValue;
}

export function MarkdownToolbar({ textareaRef, value, onChange, onInsertImage }: MarkdownToolbarProps) {
  function handleBold() {
    if (!textareaRef.current) return;
    const newValue = insertAtCursor(textareaRef.current, '**', '**', true, 'bold text');
    onChange(newValue);
  }

  function handleItalic() {
    if (!textareaRef.current) return;
    const newValue = insertAtCursor(textareaRef.current, '*', '*', true, 'italic text');
    onChange(newValue);
  }

  function handleH1() {
    if (!textareaRef.current) return;
    const newValue = prependLine(textareaRef.current, '# ');
    onChange(newValue);
  }

  function handleH2() {
    if (!textareaRef.current) return;
    const newValue = prependLine(textareaRef.current, '## ');
    onChange(newValue);
  }

  function handleLink() {
    if (!textareaRef.current) return;
    const url = window.prompt('Enter URL', 'https://');
    if (!url) return;
    const newValue = insertAtCursor(textareaRef.current, '[', `](${url})`, true, 'link text');
    onChange(newValue);
  }

  function handleImage() {
    onInsertImage();
  }

  const btnClass =
    'inline-flex items-center rounded p-1.5 text-gray-600 hover:bg-gray-100 hover:text-gray-900';

  return (
    <div className="flex items-center gap-1 border-b border-gray-200 bg-gray-50 px-2 py-1">
      <button type="button" className={btnClass} onClick={handleBold} title="Bold">
        <Bold size={16} />
      </button>
      <button type="button" className={btnClass} onClick={handleItalic} title="Italic">
        <Italic size={16} />
      </button>
      <span className="mx-1 h-5 w-px bg-gray-300" />
      <button type="button" className={btnClass} onClick={handleH1} title="Heading 1">
        <Heading1 size={16} />
      </button>
      <button type="button" className={btnClass} onClick={handleH2} title="Heading 2">
        <Heading2 size={16} />
      </button>
      <span className="mx-1 h-5 w-px bg-gray-300" />
      <button type="button" className={btnClass} onClick={handleLink} title="Link">
        <LinkIcon size={16} />
      </button>
      <button type="button" className={btnClass} onClick={handleImage} title="Image">
        <Image size={16} />
      </button>
    </div>
  );
}
