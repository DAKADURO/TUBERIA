const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  openDxf: () => ipcRenderer.invoke('dialog:openDxf'),
  openStep: () => ipcRenderer.invoke('dialog:openStep'),
  saveProject: (data) => ipcRenderer.invoke('dialog:saveProject', data),
});
