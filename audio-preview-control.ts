export function stopAllAudioPreviews(): void {
  if (typeof document === "undefined") return;

  document.querySelectorAll<HTMLAudioElement>("audio").forEach((audio) => {
    try {
      audio.pause();
      audio.currentTime = 0;
    } catch {
      // El elemento puede haber sido desmontado mientras se detenía.
    }
  });
}
