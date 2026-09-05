import { useState } from "react";
interface Props { onApply: (prompt: string) => void; }
export function PromptBar({ onApply }: Props) {
  const [prompt, setPrompt] = useState("");
  return (
    <div className="prompt-bar">
      <textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder="describí la escena o el sonido que querés buscar..." rows={2} />
      <button onClick={() => onApply(prompt.trim())} disabled={!prompt.trim()}>usar como búsqueda</button>
    </div>
  );
}
