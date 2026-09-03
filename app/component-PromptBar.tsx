import { useState } from "react";

interface Props {
  onApply: (prompt: string) => void;
}

/**
 * TODO: this currently just copies the same text into all four elements'
 * search boxes — you still adjust each one by hand before searching.
 * The planned version sends this prompt to a Groq call that returns a
 * distinct sub-prompt per element (and per layer, for elements that want
 * more than one). Swap handleApply's body for that call once it exists;
 * everything downstream (SoundtrackPanel's search box) stays the same.
 */
export function PromptBar({ onApply }: Props) {
  const [prompt, setPrompt] = useState("");

  return (
    <div className="prompt-bar">
      <textarea
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        placeholder="describí la escena y el diseño sonoro que buscás..."
        rows={2}
      />
      <button onClick={() => onApply(prompt)} disabled={!prompt.trim()}>
        usar en las 4 categorías
      </button>
    </div>
  );
}
