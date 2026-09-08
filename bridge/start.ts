// Arranca el único servicio local del AUDIAR Bridge.
// index.ts gestiona almacenamiento, descargas, OAuth y comunicación con REAPER.
// Los audios persistentes ya no se guardan en AppData\REAPER\audiar-bridge\cache.

await import("./index.ts");
