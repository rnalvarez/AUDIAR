// Arranca los dos servicios locales del AUDIAR Bridge.
// index.ts: comunicación con REAPER y cola de importación.
// download-server.ts: descargas directas a la carpeta elegida en AUDIAR.
//
// El transporte OAuth usa el fetch() nativo de Node. El Bridge se ejecuta
// con --use-system-ca desde package.json para confiar también en los
// certificados instalados en Windows.

await import("./index.ts");
await import("./download-server.ts");
