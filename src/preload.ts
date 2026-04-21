import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("api", {
  onLoadHtml: (callback: (html: string, diffHtml: string) => void) => {
    ipcRenderer.on("load-html", (_event, html, diffHtml) => {
      callback(html, diffHtml);
    });
  },
  openFile: (filePath: string) => {
    ipcRenderer.send("open-file", filePath);
  },
});
