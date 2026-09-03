import { useRef, useState } from "react";

export function VideoPanel() {
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  function handleFile(file: File | undefined) {
    if (!file) return;
    setVideoUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return URL.createObjectURL(file);
    });
    setFileName(file.name);
  }

  return (
    <div className="video-panel">
      {videoUrl ? (
        <video className="video-panel__preview" src={videoUrl} controls />
      ) : (
        <button className="video-panel__dropzone" onClick={() => inputRef.current?.click()}>
          cargar video para sonorizar
        </button>
      )}
      <input
        ref={inputRef}
        type="file"
        accept="video/*"
        hidden
        onChange={(e) => handleFile(e.target.files?.[0])}
      />
      {fileName && (
        <div className="video-panel__filename">
          {fileName}
          <button className="video-panel__replace" onClick={() => inputRef.current?.click()}>
            cambiar
          </button>
        </div>
      )}
    </div>
  );
}
