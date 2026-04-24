import { contextBridge, ipcRenderer, webUtils } from "electron";

contextBridge.exposeInMainWorld("api", {
  onLoadHtml: (callback: (html: string, diffHtml: string) => void) => {
    ipcRenderer.on("load-html", (_event, html, diffHtml) => {
      callback(html, diffHtml);
    });
  },
  onUpdateTabs: (callback: (tabs: { id: string; name: string }[], activeTabId: string | null) => void) => {
    ipcRenderer.on("update-tabs", (_event, tabs, activeTabId) => {
      callback(tabs, activeTabId);
    });
  },
  openFile: (filePath: string) => {
    ipcRenderer.send("open-file", filePath);
  },
  switchTab: (tabId: string) => {
    ipcRenderer.send("switch-tab", tabId);
  },
  closeTab: (tabId: string) => {
    ipcRenderer.send("close-tab", tabId);
  },
  openFileDialog: () => {
    ipcRenderer.send("open-file-dialog");
  },
  getPathForFile: (file: File) => {
    return webUtils.getPathForFile(file);
  },
});
