import type { SendableSound, DownloadItemState, DownloadProgress } from "./reaper-bridge";

export type DownloadBatchState = "queued" | "downloading" | "done" | "error" | "cancelled";

export interface DownloadBatch {
  id: string;
  title: string;
  folderName: string;
  groupName: string;
  sounds: SendableSound[];
  state: DownloadBatchState;
  progress: DownloadProgress;
  createdAt: number;
  error?: string;
}

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 MB";
  const mb = bytes / (1024 * 1024);
  return mb < 10 ? `${mb.toFixed(1)} MB` : `${mb.toFixed(0)} MB`;
}
function formatSpeed(bytesPerSecond: number): string {
  if (!Number.isFinite(bytesPerSecond) || bytesPerSecond <= 0) return "0 MB/s";
  return `${(bytesPerSecond / (1024 * 1024)).toFixed(1)} MB/s`;
}
function formatEta(seconds: number | undefined): string {
  if (seconds == null || !Number.isFinite(seconds) || seconds <= 0) return "—";
  const value = Math.ceil(seconds);
  if (value < 60) return `${value}s`;
  return `${Math.floor(value / 60)}m ${String(value % 60).padStart(2, "0")}s`;
}
function batchStatus(state: DownloadBatchState): string {
  if (state === "queued") return "En cola";
  if (state === "downloading") return "Descargando";
  if (state === "done") return "Completado";
  if (state === "cancelled") return "Cancelado";
  return "Con errores";
}
function itemStatus(item: DownloadItemState): string {
  if (item.state === "queued") return "En cola";
  if (item.state === "downloading") return "Descargando";
  if (item.state === "done") return "Listo";
  if (item.state === "cancelled") return "Cancelado";
  return "Error";
}

export function makeInitialDownloadProgress(sounds: SendableSound[]): DownloadProgress {
  const totalBytes = sounds.reduce((sum, sound) => sum + (sound.fileSize ?? 0), 0);
  return { current: 0, total: sounds.length, failed: 0, cancelled: 0, downloadedBytes: 0, totalBytes, remainingBytes: totalBytes, speedBytesPerSecond: 0, active: 0, items: sounds.map((sound) => ({ id: sound.id, name: sound.name, state: "queued", loadedBytes: 0, totalBytes: sound.fileSize ?? 0, speedBytesPerSecond: 0 })) };
}

export function DownloadQueue({
  batches,
  onCancelBatch,
  onCancelItem,
}: {
  batches: DownloadBatch[];
  onCancelBatch: (batchId: string) => void;
  onCancelItem: (batchId: string, itemId: string) => void;
}) {
  const active = batches.filter((batch) => batch.state === "downloading").length;
  const queued = batches.filter((batch) => batch.state === "queued").length;
  const completed = batches.filter((batch) => batch.state === "done").length;
  const cancelled = batches.filter((batch) => batch.state === "cancelled").length;

  return (
    <section className="download-queue">
      <div className="download-queue__header">
        <details open>
          <summary>
            <span className="download-queue__title">Cola de descargas</span>
            <span className="download-queue__summary-stats">{active > 0 ? `${active} activa${active > 1 ? "s" : ""}` : "sin actividad"}{queued > 0 ? ` · ${queued} en cola` : ""}{completed > 0 ? ` · ${completed} completada${completed > 1 ? "s" : ""}` : ""}{cancelled > 0 ? ` · ${cancelled} cancelada${cancelled > 1 ? "s" : ""}` : ""}</span>
          </summary>
          <div className="download-queue__body">
            {batches.map((batch) => {
              const progressPercent = batch.progress.totalBytes > 0 ? Math.min(100, (batch.progress.downloadedBytes / batch.progress.totalBytes) * 100) : batch.progress.total > 0 ? (batch.progress.current / batch.progress.total) * 100 : 0;
              return (
                <details className={`download-batch download-batch--${batch.state}`} key={batch.id} open={batch.state === "downloading" || batch.state === "queued"}>
                  <summary className="download-batch__summary">
                    <span><strong>{batch.title}</strong><span className="download-batch__folder"> · {batch.folderName}</span></span>
                    <span className="download-batch__state">{batchStatus(batch.state)}</span>
                  </summary>
                  <div className="download-batch__body">
                    <div className="download-batch__topline">
                      <div className="download-batch__meter" aria-label="Progreso de descarga"><span style={{ width: `${progressPercent}%` }} /></div>
                      {(batch.state === "queued" || batch.state === "downloading") && <button type="button" className="download-batch__cancel" onClick={() => onCancelBatch(batch.id)}>Cancelar grupo</button>}
                    </div>
                    <div className="download-batch__stats">
                      <span>{batch.progress.current}/{batch.progress.total} archivos</span>
                      <span>{formatBytes(batch.progress.downloadedBytes)} / {formatBytes(batch.progress.totalBytes)}</span>
                      <span>{formatSpeed(batch.progress.speedBytesPerSecond)}</span>
                      <span>faltan {formatBytes(batch.progress.remainingBytes)}</span>
                      <span>ETA {formatEta(batch.progress.etaSeconds)}</span>
                    </div>
                    {batch.error && <div className="download-batch__error">{batch.error}</div>}
                    <div className="download-files">
                      {batch.progress.items.map((item) => {
                        const total = item.totalBytes || 0;
                        const percent = total > 0 ? Math.min(100, (item.loadedBytes / total) * 100) : item.state === "done" ? 100 : 0;
                        return (
                          <div className="download-file" key={item.id}>
                            <div className={`download-file__dot download-file__dot--${item.state}`} />
                            <div className="download-file__main"><div className="download-file__name" title={item.name}>{item.name}</div><div className="download-file__bar"><span style={{ width: `${percent}%` }} /></div></div>
                            <div className="download-file__status">{itemStatus(item)}</div>
                            <div className="download-file__size">{formatBytes(item.loadedBytes)}{total > 0 ? ` / ${formatBytes(total)}` : ""}</div>
                            <div className="download-file__speed">{formatSpeed(item.speedBytesPerSecond)}</div>
                            {(item.state === "queued" || item.state === "downloading") && <button type="button" className="download-file__cancel" onClick={() => onCancelItem(batch.id, item.id)} aria-label={`Cancelar ${item.name}`}>Cancelar</button>}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </details>
              );
            })}
          </div>
        </details>
      </div>
    </section>
  );
}
