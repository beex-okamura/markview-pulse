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
  onShowWelcome: (callback: () => void) => {
    ipcRenderer.on("show-welcome", () => {
      callback();
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
  getRecentFiles: (): Promise<string[]> => {
    return ipcRenderer.invoke("get-recent-files");
  },
  openWelcomeTab: () => {
    ipcRenderer.send("open-welcome-tab");
  },
  getPathForFile: (file: File) => {
    return webUtils.getPathForFile(file);
  },
});
