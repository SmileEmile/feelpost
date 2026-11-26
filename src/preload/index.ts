import { contextBridge, ipcRenderer } from 'electron'
import type { FeelpostApi } from '@shared/contract'

function on<T>(channel: string, listener: (payload: T) => void): () => void {
  const handler = (_event: unknown, payload: T): void => listener(payload)
  ipcRenderer.on(channel, handler)
  return () => ipcRenderer.removeListener(channel, handler)
}

const api: FeelpostApi = {
  app: {
    getInfo: () => ipcRenderer.invoke('app:getInfo'),
    setZoomFactor: (factor) => ipcRenderer.invoke('app:setZoomFactor', { factor })
  },
  settings: {
    get: () => ipcRenderer.invoke('settings:get'),
    update: (patch) => ipcRenderer.invoke('settings:update', patch)
  },
  ai: {
    getConfig: () => ipcRenderer.invoke('ai:getConfig'),
    revealApiKey: () => ipcRenderer.invoke('ai:revealApiKey'),
    updateConfig: (input) => ipcRenderer.invoke('ai:updateConfig', input),
    testConnection: () => ipcRenderer.invoke('ai:testConnection'),
    listModels: () => ipcRenderer.invoke('ai:listModels'),
    previewContext: (input) => ipcRenderer.invoke('ai:previewContext', input),
    generate: (input) => ipcRenderer.invoke('ai:generate', input),
    cancel: (requestId) => ipcRenderer.invoke('ai:cancel', { requestId }),
    importCases: (input) => ipcRenderer.invoke('ai:importCases', input),
    onStream: (listener) => on('ai:stream', listener),
    onCompleted: (listener) => on('ai:completed', listener),
    onFailed: (listener) => on('ai:failed', listener),
    onCancelled: (listener) => on('ai:cancelled', listener)
  },
  dialog: {
    chooseDirectory: () => ipcRenderer.invoke('dialog:chooseDirectory'),
    chooseFile: () => ipcRenderer.invoke('dialog:chooseFile')
  },
  shell: {
    openPath: (path) => ipcRenderer.invoke('shell:openPath', { path })
  },
  project: {
    list: () => ipcRenderer.invoke('project:list'),
    get: (projectId) => ipcRenderer.invoke('project:get', { projectId }),
    create: (input) => ipcRenderer.invoke('project:create', input),
    update: (input) => ipcRenderer.invoke('project:update', input),
    remove: (projectId) => ipcRenderer.invoke('project:delete', { projectId }),
    validateDirectory: (path) => ipcRenderer.invoke('project:validateDirectory', { path }),
    listModules: (projectId) => ipcRenderer.invoke('project:listModules', { projectId }),
    getGlobals: (projectId) => ipcRenderer.invoke('project:getGlobals', { projectId }),
    updateGlobals: (projectId, params) => ipcRenderer.invoke('project:updateGlobals', { projectId, params })
  },
  scan: {
    start: (input) => ipcRenderer.invoke('scan:start', input),
    cancel: (scanId) => ipcRenderer.invoke('scan:cancel', { scanId }),
    getResult: (scanId) => ipcRenderer.invoke('scan:getResult', { scanId }),
    apply: (input) => ipcRenderer.invoke('scan:apply', input),
    getLastRun: (projectId) => ipcRenderer.invoke('scan:getLastRun', { projectId }),
    onProgress: (listener) => on('scan:progress', listener),
    onCompleted: (listener) => on('scan:completed', listener),
    onFailed: (listener) => on('scan:failed', listener),
    onCancelled: (listener) => on('scan:cancelled', listener)
  },
  env: {
    list: (projectId) => ipcRenderer.invoke('env:list', { projectId }),
    create: (projectId, input) => ipcRenderer.invoke('env:create', { projectId, input }),
    update: (projectId, envId, patch) => ipcRenderer.invoke('env:update', { projectId, envId, patch }),
    remove: (projectId, envId) => ipcRenderer.invoke('env:remove', { projectId, envId }),
    setDefault: (projectId, envId) => ipcRenderer.invoke('env:setDefault', { projectId, envId }),
    preview: (input) => ipcRenderer.invoke('env:preview', input)
  },
  doc: {
    exportInterface: (input) => ipcRenderer.invoke('doc:exportInterface', input),
    exportCase: (input) => ipcRenderer.invoke('doc:exportCase', input),
    previewProject: (input) => ipcRenderer.invoke('doc:previewProject', input),
    exportProject: (input) => ipcRenderer.invoke('doc:exportProject', input),
    exportCases: (input) => ipcRenderer.invoke('doc:exportCases', input),
    saveMarkdown: (input) => ipcRenderer.invoke('doc:saveMarkdown', input)
  },
  example: {
    list: (projectId, interfaceId) => ipcRenderer.invoke('example:list', { projectId, interfaceId }),
    save: (input) => ipcRenderer.invoke('example:save', input),
    update: (projectId, exampleId, name) => ipcRenderer.invoke('example:update', { projectId, exampleId, name }),
    updateFields: (projectId, exampleId, descriptions, fieldDescriptionMeta) => ipcRenderer.invoke('example:updateFields', { projectId, exampleId, descriptions, fieldDescriptionMeta }),
    remove: (projectId, exampleId) => ipcRenderer.invoke('example:delete', { projectId, exampleId })
  },
  case: {
    list: (projectId, filter) => ipcRenderer.invoke('case:list', { projectId, filter }),
    get: (projectId, caseId) => ipcRenderer.invoke('case:get', { projectId, caseId }),
    create: (input) => ipcRenderer.invoke('case:create', input),
    update: (input) => ipcRenderer.invoke('case:update', input),
    duplicate: (input) => ipcRenderer.invoke('case:duplicate', input),
    remove: (projectId, caseId) => ipcRenderer.invoke('case:delete', { projectId, caseId }),
    removeTags: (projectId, tags) => ipcRenderer.invoke('case:removeTags', { projectId, tags })
  },
  request: {
    send: (input) => ipcRenderer.invoke('request:send', input),
    cancel: (clientRequestId) => ipcRenderer.invoke('request:cancel', { clientRequestId }),
    buildCurl: (input) => ipcRenderer.invoke('request:buildCurl', input)
  },
  catalog: {
    list: (projectId) => ipcRenderer.invoke('catalog:list', { projectId }),
    get: (projectId, interfaceId) => ipcRenderer.invoke('catalog:get', { projectId, interfaceId }),
    updateManual: (input) => ipcRenderer.invoke('catalog:updateManual', input),
    confirmChange: (projectId, interfaceId) => ipcRenderer.invoke('catalog:confirmChange', { projectId, interfaceId }),
    restore: (projectId, interfaceId) => ipcRenderer.invoke('catalog:restore', { projectId, interfaceId }),
    createManual: (input) => ipcRenderer.invoke('catalog:createManual', input),
    createDirectory: (input) => ipcRenderer.invoke('catalog:createDirectory', input),
    updateDirectory: (input) => ipcRenderer.invoke('catalog:updateDirectory', input),
    moveDirectory: (input) => ipcRenderer.invoke('catalog:moveDirectory', input),
    deleteDirectory: (projectId, directoryId) => ipcRenderer.invoke('catalog:deleteDirectory', { projectId, directoryId }),
    copyDirectory: (input) => ipcRenderer.invoke('catalog:copyDirectory', input),
    moveInterface: (input) => ipcRenderer.invoke('catalog:moveInterface', input),
    cloneInterface: (input) => ipcRenderer.invoke('catalog:cloneInterface', input),
    deleteInterface: (projectId, interfaceId) => ipcRenderer.invoke('catalog:deleteInterface', { projectId, interfaceId }),
    renamePackage: (input) => ipcRenderer.invoke('catalog:renamePackage', input)
  }
}

contextBridge.exposeInMainWorld('feelpost', api)
