import { useEffect, useMemo, useRef, useState } from 'react'
import type {
  CatalogTree,
  Environment,
  InterfaceDetail,
  InterfaceSummary,
  ManualDirectory,
  ManualDirectoryGroup,
  MavenModule,
  ProjectDetail,
  AppInfo,
  Preferences,
  ProjectSummary,
  RequestDraft,
  ScanCandidate,
  ScanResult,
  ScanRunSummary
} from '@shared/contract'
import { unwrap } from './api'
import RequestPanel from './RequestPanel'
import EnvsView from './EnvsView'
import SettingsView from './SettingsView'
import brandIcon from './assets/brand.svg'
import NewHttpPanel from './NewHttpPanel'
import SelectMenu from './SelectMenu'
import { envTagStyle } from './env-color'
import CasesView from './CasesView'
import Message from './Message'
import DocsView from './DocsView'

interface Props {
  project: ProjectDetail
  projects: ProjectSummary[]
  info: AppInfo | null
  prefs: Preferences | null
  onPrefs: (prefs: Preferences) => void
  onBack: () => void
  onSwitchProject: (projectId: string) => void
  onCreateProject: () => void
  onOpenProjectSettings: () => void
  onChanged: () => void
  notify: (message: string) => void
  theme: 'light' | 'dark'
  onToggleTheme: () => void
}

const ICONS: Record<string, string[]> = {
  braces: [
    'M8 3a3 3 0 0 0-3 3v3a3 3 0 0 1-3 3 3 3 0 0 1 3 3v3a3 3 0 0 0 3 3',
    'M16 3a3 3 0 0 1 3 3v3a3 3 0 0 0 3 3 3 3 0 0 0-3 3v3a3 3 0 0 1-3 3'
  ],
  cases: ['M4 4h16v16H4z', 'M8 12l3 3 5-6'],
  doc: ['M6 2h8l4 4v16H6z', 'M14 2v6h6', 'M9 13h6M9 17h6'],
  folder: ['M3 6h6l2 2h10v11H3z'],
  repo: ['M4 4h16v16H4z', 'M9 9l-2 3 2 3', 'M15 9l2 3-2 3'],
  package: ['M4 7l8-4 8 4v10l-8 4-8-4z', 'M4 7l8 4 8-4', 'M12 11v10'],
  globe: ['M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z', 'M3 12h18', 'M12 3c2.5 2.5 4 5.6 4 9s-1.5 6.5-4 9c-2.5-2.5-4-5.6-4-9s1.5-6.5 4-9z'],
  settings: ['M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3', 'M1 14h6M9 8h6M17 16h6'],
  scan: ['M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z', 'M12 3v3M12 18v3M3 12h3M18 12h3'],
  search: ['M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14z', 'M20 20l-3.5-3.5'],
  chevron: ['M6 9l6 6 6-6'],
  spark: ['M12 2.5l1.8 6.1L20 10.4l-6.2 1.8L12 18.3l-1.8-6.1L4 10.4l6.2-1.8z'],
  robot: [
    'M12 7.5V4.5',
    'M9 4.5h6',
    'M5 8h14a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2z',
    'M9 12.5h.01',
    'M15 12.5h.01',
    'M9 16.5h6'
  ],
  plus: ['M12 5v14M5 12h14'],
  sun: ['M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8z', 'M12 2v2M12 20v2M4 12H2M22 12h-2M5 5l1.5 1.5M17.5 17.5L19 19M19 5l-1.5 1.5M6.5 17.5L5 19'],
  moon: ['M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z'],
  send: ['M22 2L11 13', 'M22 2l-7 20-4-9-9-4 20-7z'],
  copy: ['M9 9h10v10H9z', 'M5 15H4V4h11v1'],
  clone: ['M8 8h12v12H8z', 'M4 16V4h12'],
  edit: ['M4 20h4L19 9l-4-4L4 16z', 'M14 6l4 4'],
  trash: ['M4 7h16', 'M9 7V4h6v3', 'M6 7l1 13h10l1-13'],
  close: ['M6 6l12 12M18 6L6 18'],
  all: ['M4 4h16v16H4z', 'M9 9h6v6H9z'],
  left: ['M15 6l-6 6 6 6'],
  right: ['M9 6l6 6-6 6'],
  more: ['M5 12h.01', 'M12 12h.01', 'M19 12h.01']
}

function Icon({ name, size = 16 }: { name: string; size?: number }): JSX.Element {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {(ICONS[name] ?? ICONS.doc).map((d) => <path key={d} d={d} />)}
    </svg>
  )
}

function displayBaseUrl(url: string): string {
  return /^https?:\/\//i.test(url) ? url : `http://${url}`
}

function treeLabel(item: InterfaceSummary): string {
  const hasScannedName = item.nameOverridden || item.source === 'manual' || (item.nameSource !== undefined && item.nameSource !== 'method')
  if (hasScannedName && item.name.trim()) return item.name
  const segments = item.path.split('/').filter(Boolean)
  return segments[segments.length - 1] || item.path
}

function firstInterface(tree: CatalogTree): InterfaceSummary | null {
  for (const module of tree.modules) {
    for (const pkg of module.packages) {
      if (pkg.interfaces.length > 0) return pkg.interfaces[0]
    }
  }
  for (const directory of tree.manualDirectories) {
    if (directory.interfaces.length > 0) return directory.interfaces[0]
  }
  return tree.manual[0] ?? null
}

export default function Workspace({ project, projects, info, prefs, onPrefs, onBack, onSwitchProject, onCreateProject, onOpenProjectSettings, onChanged, notify, theme, onToggleTheme }: Props): JSX.Element {
  const [tree, setTree] = useState<CatalogTree | null>(null)
  const [tabs, setTabs] = useState<InterfaceDetail[]>([])
  const [activeTabId, setActiveTabId] = useState('')
  const [tabContext, setTabContext] = useState<{ id: string; x: number; y: number } | null>(null)
  const [lastRun, setLastRun] = useState<ScanRunSummary | null>(null)
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})
  const [query, setQuery] = useState('')
  const [method, setMethod] = useState('ALL')
  const [scan, setScan] = useState<{ id: string; logs: string[]; percent: number } | null>(null)
  const [scanResult, setScanResult] = useState<ScanResult | null>(null)
  const [selectedCandidates, setSelectedCandidates] = useState<Set<string>>(new Set())
  const [resultQuery, setResultQuery] = useState('')
  const [resultMethod, setResultMethod] = useState('ALL')
  const [resultCollapsed, setResultCollapsed] = useState<Record<string, boolean>>({})
  const [scopeOpen, setScopeOpen] = useState(false)
  const [scopeType, setScopeType] = useState<'all' | 'directory' | 'modules'>('all')
  const [scopeDir, setScopeDir] = useState('')
  const [modules, setModules] = useState<MavenModule[]>([])
  const [selectedModules, setSelectedModules] = useState<Set<string>>(new Set())
  const [error, setError] = useState('')
  const NEW_HTTP_ID = '__new_http__'
  const [newHttpOpen, setNewHttpOpen] = useState(false)
  const [newHttpDirectoryId, setNewHttpDirectoryId] = useState('')
  const [createMenuOpen, setCreateMenuOpen] = useState(false)
  const [directoryOpen, setDirectoryOpen] = useState(false)
  const [editingDirectoryId, setEditingDirectoryId] = useState('')
  const [directoryForm, setDirectoryForm] = useState<{ name: string; description: string; parentId: string | null }>({ name: '', description: '', parentId: null })
  const [directoryError, setDirectoryError] = useState('')
  const [directoryBusy, setDirectoryBusy] = useState(false)
  const [dirContextMenu, setDirContextMenu] = useState<{ directory: ManualDirectory; x: number; y: number } | null>(null)
  const [dirActionMenu, setDirActionMenu] = useState<{ directory: ManualDirectory; kind: 'new' | 'more'; x: number; y: number } | null>(null)
  const [dirSubmenuOpen, setDirSubmenuOpen] = useState(false)
  const [movingDirectory, setMovingDirectory] = useState<ManualDirectory | null>(null)
  const [moveDirParentId, setMoveDirParentId] = useState('')
  const [packageContext, setPackageContext] = useState<{ module: string; packageName: string; label: string; x: number; y: number } | null>(null)
  const [packageRename, setPackageRename] = useState<{ module: string; packageName: string; label: string } | null>(null)
  const [packageBusy, setPackageBusy] = useState(false)
  const [deletingDirectory, setDeletingDirectory] = useState<ManualDirectory | null>(null)
  const [interfaceContext, setInterfaceContext] = useState<{ item: InterfaceSummary; x: number; y: number } | null>(null)
  const [movingInterface, setMovingInterface] = useState<InterfaceSummary | null>(null)
  const [moveDirectoryId, setMoveDirectoryId] = useState('')
  const [deletingInterface, setDeletingInterface] = useState<InterfaceSummary | null>(null)
  const [interfaceBusy, setInterfaceBusy] = useState(false)
  const [envs, setEnvs] = useState<Environment[]>([])
  const [envId, setEnvId] = useState('')
  const [envMenu, setEnvMenu] = useState(false)
  const [projectMenu, setProjectMenu] = useState(false)
  const [section, setSection] = useState<'interfaces' | 'cases' | 'docs' | 'envs' | 'settings'>('interfaces')
  const [previousSection, setPreviousSection] = useState<'interfaces' | 'cases' | 'docs' | 'envs' | 'settings'>('interfaces')
  const [settingsFocus, setSettingsFocus] = useState<{ section: string; nonce: number } | null>(null)
  const sectionRef = useRef(section)
  const scanIdRef = useRef<string | null>(null)
  const autoOpenedRef = useRef(false)
  const projectMenuRef = useRef<HTMLDivElement>(null)
  const createMenuRef = useRef<HTMLDivElement>(null)
  const dirContextRef = useRef<HTMLDivElement>(null)
  const dirActionRef = useRef<HTMLDivElement>(null)
  const packageContextRef = useRef<HTMLDivElement>(null)
  const interfaceContextRef = useRef<HTMLDivElement>(null)
  const tabContextRef = useRef<HTMLDivElement>(null)

  const env = envs.find((item) => item.id === envId) ?? envs[0]
  const activeDetail = tabs.find((item) => item.id === activeTabId) ?? null
  const otherProjects = projects.filter((item) => item.id !== project.id)

  async function loadEnvs(): Promise<Environment[]> {
    const list = await unwrap(window.feelpost.env.list(project.id))
    setEnvs(list)
    setEnvId((current) => list.some((item) => item.id === current)
      ? current
      : list.find((item) => item.isDefault)?.id ?? list[0]?.id ?? '')
    return list
  }

  useEffect(() => {
    if (!projectMenu) return
    const close = (event: MouseEvent): void => {
      if (projectMenuRef.current && !projectMenuRef.current.contains(event.target as Node)) setProjectMenu(false)
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [projectMenu])

  useEffect(() => {
    if (!createMenuOpen) return
    const close = (event: MouseEvent): void => {
      if (createMenuRef.current && !createMenuRef.current.contains(event.target as Node)) setCreateMenuOpen(false)
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [createMenuOpen])

  useEffect(() => {
    if (!dirContextMenu) return
    const close = (event: MouseEvent): void => {
      if (!dirContextRef.current?.contains(event.target as Node)) setDirContextMenu(null)
    }
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') setDirContextMenu(null)
    }
    document.addEventListener('mousedown', close)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', close)
      document.removeEventListener('keydown', onKey)
    }
  }, [dirContextMenu])

  useEffect(() => {
    if (!dirActionMenu) return
    const close = (event: MouseEvent): void => {
      if (!dirActionRef.current?.contains(event.target as Node)) setDirActionMenu(null)
    }
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') setDirActionMenu(null)
    }
    document.addEventListener('mousedown', close)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', close)
      document.removeEventListener('keydown', onKey)
    }
  }, [dirActionMenu])

  useEffect(() => {
    if (!packageContext) return
    const close = (event: MouseEvent): void => {
      if (!packageContextRef.current?.contains(event.target as Node)) setPackageContext(null)
    }
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') setPackageContext(null)
    }
    document.addEventListener('mousedown', close)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', close)
      document.removeEventListener('keydown', onKey)
    }
  }, [packageContext])

  useEffect(() => {
    if (!interfaceContext) return
    const close = (event: MouseEvent): void => {
      if (!interfaceContextRef.current?.contains(event.target as Node)) setInterfaceContext(null)
    }
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') setInterfaceContext(null)
    }
    document.addEventListener('mousedown', close)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', close)
      document.removeEventListener('keydown', onKey)
    }
  }, [interfaceContext])

  async function loadCatalog(): Promise<void> {
    const [treeData, run] = await Promise.all([
      unwrap(window.feelpost.catalog.list(project.id)),
      unwrap(window.feelpost.scan.getLastRun(project.id))
    ])
    setTree(treeData)
    setLastRun(run)
    setCollapsed((current) => {
      const next = { ...current }
      treeData.modules.forEach((module) => {
        if (next[module.name] === undefined) next[module.name] = false
      })
      return next
    })
    if (!autoOpenedRef.current) {
      autoOpenedRef.current = true
      const first = firstInterface(treeData)
      if (first) void openInterface(first.id)
    }
  }

  async function openInterface(id: string): Promise<void> {
    if (tabs.some((tab) => tab.id === id)) {
      setActiveTabId(id)
      return
    }
    try {
      const loaded = await unwrap(window.feelpost.catalog.get(project.id, id))
      setTabs((current) => current.some((tab) => tab.id === id) ? current : [...current, loaded])
      setActiveTabId(id)
    } catch (err) {
      setError((err as Error).message)
    }
  }

  async function reloadInterface(id: string): Promise<void> {
    try {
      const loaded = await unwrap(window.feelpost.catalog.get(project.id, id))
      setTabs((current) => current.map((tab) => (tab.id === id ? loaded : tab)))
    } catch (err) {
      setError((err as Error).message)
    }
  }

  function closeTab(id: string): void {
    if (id === NEW_HTTP_ID) {
      setNewHttpOpen(false)
      setActiveTabId(tabs[Math.max(0, tabs.length - 1)]?.id ?? '')
      return
    }
    const index = tabs.findIndex((tab) => tab.id === id)
    const next = tabs.filter((tab) => tab.id !== id)
    setTabs(next)
    if (id === activeTabId) setActiveTabId(next[Math.min(index, next.length - 1)]?.id ?? '')
  }

  function closeAllTabs(): void {
    setTabs([])
    setNewHttpOpen(false)
    setActiveTabId('')
  }

  function closeTabsLeft(id: string): void {
    if (id === NEW_HTTP_ID) {
      setTabs([])
      setActiveTabId(NEW_HTTP_ID)
      return
    }
    const index = tabs.findIndex((tab) => tab.id === id)
    if (index <= 0) return
    const next = tabs.slice(index)
    setTabs(next)
    if (!next.some((tab) => tab.id === activeTabId) && activeTabId !== NEW_HTTP_ID) setActiveTabId(id)
  }

  function closeTabsRight(id: string): void {
    if (id === NEW_HTTP_ID) return
    const index = tabs.findIndex((tab) => tab.id === id)
    if (index < 0) return
    const next = tabs.slice(0, index + 1)
    setTabs(next)
    setNewHttpOpen(false)
    if (activeTabId === NEW_HTTP_ID || !next.some((tab) => tab.id === activeTabId)) setActiveTabId(id)
  }

  function openTabContext(event: React.MouseEvent, id: string): void {
    event.preventDefault()
    event.stopPropagation()
    setActiveTabId(id)
    setTabContext({
      id,
      x: Math.min(event.clientX, window.innerWidth - 180),
      y: Math.min(event.clientY, window.innerHeight - 170)
    })
  }

  useEffect(() => {
    if (!tabContext) return
    const close = (event: MouseEvent): void => {
      if (!tabContextRef.current?.contains(event.target as Node)) setTabContext(null)
    }
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') setTabContext(null)
    }
    document.addEventListener('mousedown', close)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', close)
      document.removeEventListener('keydown', onKey)
    }
  }, [tabContext])

  useEffect(() => {
    if (sectionRef.current !== section) {
      setPreviousSection(sectionRef.current)
      sectionRef.current = section
    }
  }, [section])

  useEffect(() => {
    void loadCatalog().catch((err) => setError((err as Error).message))
    void loadEnvs().catch((err) => setError((err as Error).message))
    const offs = [
      window.feelpost.scan.onProgress((payload) => {
        setScan((current) =>
          current && current.id === payload.scanId
            ? {
                ...current,
                percent: payload.percent ?? 0,
                logs: current.logs[current.logs.length - 1] === payload.message
                  ? current.logs
                  : [...current.logs.slice(-30), payload.message]
              }
            : current
        )
      }),
      window.feelpost.scan.onCompleted((payload) => {
        if (scanIdRef.current !== payload.scanId) return
        void (async () => {
          try {
            const result = await unwrap(window.feelpost.scan.getResult(payload.scanId))
            setScan(null)
            setScanResult(result)
            setSelectedCandidates(new Set(result.candidates.map((item) => item.candidateId)))
            setResultQuery('')
            setResultMethod('ALL')
            setResultCollapsed({})
            setCollapsed((current) => {
              const next = { ...current }
              Object.keys(next).forEach((key) => { next[key] = false })
              return next
            })
          } catch (err) {
            setScan(null)
            setError((err as Error).message)
          }
        })()
      }),
      window.feelpost.scan.onFailed((payload) => {
        if (scanIdRef.current !== payload.scanId) return
        scanIdRef.current = null
        setScan(null)
        setError(payload.error.message)
      }),
      window.feelpost.scan.onCancelled((payload) => {
        if (scanIdRef.current !== payload.scanId) return
        scanIdRef.current = null
        setScan(null)
        notify('已取消扫描，本次结果未保留')
      })
    ]
    return () => offs.forEach((off) => off())
  }, [project.id])

  async function exportInterfaceDoc(item: InterfaceSummary): Promise<void> {
    try {
      const result = await unwrap(
        window.feelpost.doc.exportInterface({
          projectId: project.id,
          interfaceId: item.id,
          envId: envId || undefined
        })
      )
      if (result.saved) notify(`已导出：${result.path}`)
    } catch (err) {
      setError((err as Error).message)
    }
  }

  async function copyInterfaceCurl(item: InterfaceSummary): Promise<void> {
    if (!env) {
      setError('当前项目没有可用环境。')
      return
    }
    try {
      const detail = await unwrap(window.feelpost.catalog.get(project.id, item.id))
      const draft: RequestDraft = detail.requestDraft ?? {
        requestMethod: detail.method,
        requestUrl: detail.path,
        pathParams: {},
        query: [],
        headers: [],
        cookies: [],
        bodyType: 'none',
        bodyFormat: 'json',
        bodyRaw: '',
        formRows: []
      }
      const { curl } = await unwrap(window.feelpost.request.buildCurl({
        projectId: project.id,
        envId: env.id,
        interfaceId: item.id,
        draft
      }))
      await navigator.clipboard.writeText(curl)
      notify('curl 已复制')
    } catch (err) {
      setError((err as Error).message)
    }
  }

  async function copyInterfaceAddress(item: InterfaceSummary): Promise<void> {
    const absolute = /^https?:\/\//i.test(item.path)
    const address = absolute ? item.path : `${env?.baseUrl.replace(/\/+$/, '') ?? ''}${item.path}`
    try {
      await navigator.clipboard.writeText(address)
      notify('接口地址已复制')
    } catch (err) {
      setError((err as Error).message)
    }
  }

  function openMoveInterface(item: InterfaceSummary): void {
    setInterfaceContext(null)
    setMovingInterface(item)
    setMoveDirectoryId(item.manualDirectoryId ?? '')
  }

  async function moveInterface(): Promise<void> {
    if (!movingInterface) return
    setInterfaceBusy(true)
    try {
      await unwrap(window.feelpost.catalog.moveInterface({
        projectId: project.id,
        interfaceId: movingInterface.id,
        directoryId: moveDirectoryId || null
      }))
      await loadCatalog()
      notify('接口已移动')
      setMovingInterface(null)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setInterfaceBusy(false)
    }
  }

  async function cloneInterface(item: InterfaceSummary): Promise<void> {
    setInterfaceContext(null)
    try {
      const cloned = await unwrap(window.feelpost.catalog.cloneInterface({ projectId: project.id, interfaceId: item.id }))
      await loadCatalog()
      setTabs((current) => [...current.filter((tab) => tab.id !== cloned.id), cloned])
      setActiveTabId(cloned.id)
      notify('接口已克隆')
    } catch (err) {
      setError((err as Error).message)
    }
  }

  async function removeInterface(): Promise<void> {
    if (!deletingInterface) return
    setInterfaceBusy(true)
    try {
      await unwrap(window.feelpost.catalog.deleteInterface(project.id, deletingInterface.id))
      setDeletingInterface(null)
      closeTab(deletingInterface.id)
      await loadCatalog()
      notify('接口已删除')
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setInterfaceBusy(false)
    }
  }

  async function openScanScope(): Promise<void> {
    if (!project.sourceDir.trim()) {
      try {
        const picked = await unwrap(window.feelpost.dialog.chooseDirectory())
        if (!picked) return
        await unwrap(window.feelpost.project.update({
          projectId: project.id,
          patch: { sourceDir: picked.path }
        }))
        onChanged()
        notify('源码目录已设置')
      } catch (err) {
        setError((err as Error).message)
        return
      }
    }
    try {
      const list = await unwrap(window.feelpost.project.listModules(project.id))
      setModules(list)
      setSelectedModules((current) => new Set([...current].filter((path) => list.some((module) => module.path === path))))
    } catch (err) {
      setError((err as Error).message)
      return
    }
    setScopeOpen(true)
  }

  async function startScan(): Promise<void> {
    setScopeOpen(false)
    setError('')
    try {
      const { scanId } = await unwrap(
        window.feelpost.scan.start({
          projectId: project.id,
          scope: scopeType === 'all'
            ? { type: 'all' }
            : scopeType === 'directory'
              ? { type: 'directory', directory: scopeDir }
              : { type: 'modules', modules: [...selectedModules] }
        })
      )
      scanIdRef.current = scanId
      setScan({ id: scanId, logs: ['正在准备扫描…'], percent: 0 })
    } catch (err) {
      setError((err as Error).message)
    }
  }

  async function cancelScan(): Promise<void> {
    if (scan) await window.feelpost.scan.cancel(scan.id)
  }

  async function applyScan(): Promise<void> {
    if (!scanResult) return
    try {
      await unwrap(window.feelpost.scan.apply({ scanId: scanResult.scanId, candidateIds: [...selectedCandidates] }))
      setScanResult(null)
      scanIdRef.current = null
      await loadCatalog()
      onChanged()
      notify('扫描结果已入库')
    } catch (err) {
      setError((err as Error).message)
    }
  }

  async function confirmChange(): Promise<void> {
    if (!activeDetail) return
    try {
      await unwrap(window.feelpost.catalog.confirmChange(project.id, activeDetail.id))
      await reloadInterface(activeDetail.id)
      await loadCatalog()
      notify('已确认变更')
    } catch (err) {
      setError((err as Error).message)
    }
  }

  async function restore(): Promise<void> {
    if (!activeDetail) return
    try {
      await unwrap(window.feelpost.catalog.restore(project.id, activeDetail.id))
      await reloadInterface(activeDetail.id)
      await loadCatalog()
      notify('已恢复为已注册')
    } catch (err) {
      setError((err as Error).message)
    }
  }

  async function createQuickHttp(directoryId = ''): Promise<void> {
    setCreateMenuOpen(false)
    try {
      const created = await unwrap(window.feelpost.catalog.createManual({
        projectId: project.id,
        method: 'GET',
        path: `/new-http-${Date.now().toString(36)}`,
        name: '新建接口',
        directoryId: directoryId || undefined
      }))
      notify('已创建空白接口，可直接编辑请求并发送')
      handleHttpCreated(created)
    } catch (err) {
      setError((err as Error).message)
    }
  }

  function openNewHttp(directoryId = ''): void {
    void createQuickHttp(directoryId)
  }

  function handleHttpCreated(created: InterfaceDetail): void {
    setNewHttpOpen(false)
    setNewHttpDirectoryId('')
    setTabs((current) => [...current.filter((tab) => tab.id !== created.id), created])
    setActiveTabId(created.id)
    void loadCatalog()
  }

  function openCreateDirectory(parentId: string | null = null): void {
    setEditingDirectoryId('')
    setDirectoryForm({ name: '', description: '', parentId })
    setDirectoryError('')
    setCreateMenuOpen(false)
    setDirectoryOpen(true)
  }

  function openDirActionMenu(event: React.MouseEvent, directory: ManualDirectory, kind: 'new' | 'more'): void {
    event.stopPropagation()
    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect()
    setDirSubmenuOpen(false)
    setDirActionMenu({
      directory,
      kind,
      x: Math.min(rect.left, window.innerWidth - 190),
      y: Math.min(rect.bottom + 4, window.innerHeight - 180)
    })
  }

  function openMoveDirectory(directory: ManualDirectory): void {
    setDirActionMenu(null)
    setDirContextMenu(null)
    setMovingDirectory(directory)
    setMoveDirParentId(directory.parentId ?? '')
  }

  function directoryMoveOptions(directory: ManualDirectory): Array<{ value: string; label: string }> {
    const all = tree?.manualDirectories ?? []
    const blocked = new Set<string>([directory.id])
    let changed = true
    while (changed) {
      changed = false
      for (const item of all) {
        if (item.parentId && blocked.has(item.parentId) && !blocked.has(item.id)) {
          blocked.add(item.id)
          changed = true
        }
      }
    }
    return [
      { value: 'NONE', label: '未分组' },
      ...all.filter((item) => !blocked.has(item.id)).map((item) => ({ value: item.id, label: item.name }))
    ]
  }

  async function saveDirectoryMove(): Promise<void> {
    if (!movingDirectory) return
    try {
      await unwrap(window.feelpost.catalog.moveDirectory({
        projectId: project.id,
        directoryId: movingDirectory.id,
        parentId: moveDirParentId || null
      }))
      await loadCatalog()
      setMovingDirectory(null)
      notify('目录已移动')
    } catch (err) {
      setError((err as Error).message)
    }
  }

  function openEditDirectory(directory: ManualDirectory): void {
    setDirContextMenu(null)
    setEditingDirectoryId(directory.id)
    setDirectoryForm({ name: directory.name, description: directory.description, parentId: directory.parentId ?? null })
    setDirectoryError('')
    setDirectoryOpen(true)
  }

  async function saveDirectory(): Promise<void> {
    if (!directoryForm.name.trim()) {
      setDirectoryError('目录名称不能为空。')
      return
    }
    setDirectoryBusy(true)
    setDirectoryError('')
    try {
      if (editingDirectoryId) {
        await unwrap(window.feelpost.catalog.updateDirectory({
          projectId: project.id,
          directoryId: editingDirectoryId,
          name: directoryForm.name.trim(),
          description: directoryForm.description.trim()
        }))
        notify('目录已更新')
      } else {
        await unwrap(window.feelpost.catalog.createDirectory({
          projectId: project.id,
          name: directoryForm.name.trim(),
          description: directoryForm.description.trim(),
          parentId: directoryForm.parentId
        }))
        notify('目录已创建')
      }
      await loadCatalog()
      setDirectoryOpen(false)
      setEditingDirectoryId('')
      setDirectoryForm({ name: '', description: '', parentId: null })
    } catch (err) {
      setDirectoryError((err as Error).message)
    } finally {
      setDirectoryBusy(false)
    }
  }

  async function savePackageRename(): Promise<void> {
    if (!packageRename) return
    setPackageBusy(true)
    try {
      await unwrap(window.feelpost.catalog.renamePackage({
        projectId: project.id,
        packageName: `${packageRename.module}::${packageRename.packageName}`,
        label: packageRename.label.trim() || null
      }))
      setPackageRename(null)
      await loadCatalog()
      notify(packageRename.label.trim() ? '包显示名称已更新' : '已恢复原包名')
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setPackageBusy(false)
    }
  }

  async function resetPackageAlias(): Promise<void> {
    if (!packageContext) return
    setPackageBusy(true)
    try {
      await unwrap(window.feelpost.catalog.renamePackage({
        projectId: project.id,
        packageName: `${packageContext.module}::${packageContext.packageName}`,
        label: null
      }))
      setPackageContext(null)
      await loadCatalog()
      notify('已恢复原包名')
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setPackageBusy(false)
    }
  }

  async function copyDirectory(directory: ManualDirectory): Promise<void> {
    setDirContextMenu(null)
    try {
      const created = await unwrap(window.feelpost.catalog.copyDirectory({ projectId: project.id, directoryId: directory.id }))
      await loadCatalog()
      notify(`目录「${created.name}」已复制`)
    } catch (err) {
      setError((err as Error).message)
    }
  }

  async function removeDirectory(): Promise<void> {
    if (!deletingDirectory) return
    setDirectoryBusy(true)
    setError('')
    try {
      await unwrap(window.feelpost.catalog.deleteDirectory(project.id, deletingDirectory.id))
      await loadCatalog()
      notify(`目录「${deletingDirectory.name}」已删除，目录内接口已移至未分组`)
      setDeletingDirectory(null)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setDirectoryBusy(false)
    }
  }

  const isFiltering = query.trim() !== '' || method !== 'ALL'
  const filteredModules = useMemo(() => {
    if (!tree) return []
    const keyword = query.trim().toLowerCase()
    return tree.modules
      .map((module) => ({
        ...module,
        packages: module.packages
          .map((pkg) => ({
            ...pkg,
            interfaces: pkg.interfaces.filter((item) => {
              if (method !== 'ALL' && item.method !== method) return false
              if (!keyword) return true
              return `${item.method} ${item.path} ${item.name}`.toLowerCase().includes(keyword)
            })
          }))
          .filter((pkg) => pkg.interfaces.length > 0)
      }))
      .filter((module) => module.packages.length > 0)
  }, [tree, query, method])

  const filteredDirectories = useMemo(() => {
    if (!tree) return []
    const keyword = query.trim().toLowerCase()
    return tree.manualDirectories
      .map((directory) => ({
        ...directory,
        interfaces: directory.interfaces.filter((item) => {
          if (method !== 'ALL' && item.method !== method) return false
          if (!keyword) return true
          return `${item.method} ${item.path} ${item.name}`.toLowerCase().includes(keyword)
        })
      }))
      .filter((directory) => !isFiltering || directory.interfaces.length > 0)
  }, [tree, query, method, isFiltering])

  const filteredManual = useMemo(() => {
    if (!tree) return []
    const keyword = query.trim().toLowerCase()
    return tree.manual.filter((item) => {
      if (method !== 'ALL' && item.method !== method) return false
      if (!keyword) return true
      return `${item.method} ${item.path} ${item.name}`.toLowerCase().includes(keyword)
    })
  }, [tree, query, method])

  const registeredCount = useMemo(() => {
    if (!tree) return 0
    const manual = tree.manualDirectories.flatMap((directory) => directory.interfaces).concat(tree.manual)
    const all = tree.modules.flatMap((module) => module.packages.flatMap((pkg) => pkg.interfaces)).concat(manual)
    return all.filter((item) => item.status === 'registered').length
  }, [tree])

  const allCollapsed = useMemo(() => {
    const moduleNames = filteredModules.map((module) => module.name)
    const packageKeys = filteredModules.flatMap((module) => module.packages.map((pkg) => `${module.name}::${pkg.name}`))
    const directoryIds = filteredDirectories.map((directory) => directory.id)
    if (moduleNames.length + packageKeys.length + directoryIds.length === 0) return false
    const modulesCollapsed = moduleNames.every((name) => collapsed[name] === true)
    const packagesCollapsed = packageKeys.every((key) => collapsed[key] === true)
    const directoriesCollapsed = directoryIds.every((id) => collapsed[id] === true)
    return modulesCollapsed && packagesCollapsed && directoriesCollapsed
  }, [filteredModules, filteredDirectories, collapsed])

  const filteredCandidates = useMemo(() => {
    if (!scanResult) return []
    const keyword = resultQuery.trim().toLowerCase()
    return scanResult.candidates.filter((candidate) => {
      if (resultMethod !== 'ALL' && candidate.method !== resultMethod) return false
      if (!keyword) return true
      return `${candidate.name} ${candidate.path}`.toLowerCase().includes(keyword)
    })
  }, [scanResult, resultQuery, resultMethod])

  const candidateGroups = useMemo(() => {
    const groups = new Map<string, ScanCandidate[]>()
    for (const candidate of filteredCandidates) {
      const moduleName = candidate.module || '未分组'
      const list = groups.get(moduleName) ?? []
      list.push(candidate)
      groups.set(moduleName, list)
    }
    return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b))
  }, [filteredCandidates])

  const totalCount = useMemo(() => {
    if (!tree) return project.interfaceCount
    return tree.modules.reduce((sum, module) => sum + module.interfaceCount, 0)
      + tree.manualDirectories.reduce((sum, directory) => sum + directory.interfaces.length, 0)
      + tree.manual.length
  }, [tree, project.interfaceCount])

  function manualItem(item: InterfaceSummary): JSX.Element {
    return (
      <div
        key={item.id}
        className={`tree-item ${activeDetail?.id === item.id ? 'active' : ''}`}
        role="button"
        tabIndex={0}
        onClick={() => void openInterface(item.id)}
        onContextMenu={(event) => {
          event.preventDefault()
          setDirContextMenu(null)
          setInterfaceContext({
            item,
            x: Math.min(event.clientX, window.innerWidth - 190),
            y: Math.min(event.clientY, window.innerHeight - 250)
          })
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault()
            void openInterface(item.id)
          }
        }}
      >
        <span className={`method m-${item.method.toLowerCase()}`}>{item.method}</span>
        <span className="tree-main">
          <span className="tree-label">{treeLabel(item)}</span>
        </span>
      </div>
    )
  }

  function renderDirectory(directory: ManualDirectoryGroup, depth: number): JSX.Element {
    const isDirCollapsed = collapsed[directory.id] === true
    const children = filteredDirectories.filter((item) => item.parentId === directory.id)
    return (
      <div className={`tree-module tree-dir ${depth > 0 ? 'tree-dir-child' : ''}`} key={directory.id}>
        <div
          className="tree-module-head static dir-head"
          role="button"
          tabIndex={0}
          title={directory.description || directory.name}
          onClick={() => setCollapsed((state) => ({ ...state, [directory.id]: !isDirCollapsed }))}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault()
              setCollapsed((state) => ({ ...state, [directory.id]: !isDirCollapsed }))
            }
          }}
          onContextMenu={(event) => {
            event.preventDefault()
            setInterfaceContext(null)
            setPackageContext(null)
            setDirContextMenu({
              directory,
              x: Math.min(event.clientX, window.innerWidth - 170),
              y: Math.min(event.clientY, window.innerHeight - 170)
            })
          }}
        >
          <span className={`caret ${isDirCollapsed ? 'closed' : ''}`}>▾</span>
          <span className="tree-folder"><Icon name="folder" size={12} /></span>
          <span className="mod-name">{directory.name}</span>
          <span className="count">{directory.interfaces.length}</span>
          <div className="dir-actions">
            <button
              className="dir-action"
              title="新建"
              onClick={(event) => openDirActionMenu(event, directory, 'new')}
            >
              <Icon name="plus" size={14} />
            </button>
            <button
              className="dir-action"
              title="更多操作"
              onClick={(event) => openDirActionMenu(event, directory, 'more')}
            >
              <Icon name="more" size={15} />
            </button>
          </div>
        </div>
        {!isDirCollapsed && (
          <div className="tree-dir-children">
            {directory.interfaces.map(manualItem)}
            {children.map((child) => renderDirectory(child, depth + 1))}
            {!isFiltering && directory.interfaces.length === 0 && children.length === 0 && (
              <p className="small-note tree-empty-dir">空目录</p>
            )}
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="wslayout">
      <header className="topbar">
        <button className="brand as-button" onClick={onBack} title="返回项目列表">
          <span className="brand-mark"><img src={brandIcon} alt="" /></span>
          <span className="brand-name">FeelPost</span>
        </button>
        <div className="project-wrap" ref={projectMenuRef}>
          <button className="picker" onClick={() => setProjectMenu((open) => !open)} aria-expanded={projectMenu} title="切换项目">
            <span className="lbl">项目</span><b>{project.name}</b><Icon name="chevron" size={14} />
          </button>
          {projectMenu && (
            <div className="menu project-menu">
              {otherProjects.map((item) => (
                <button
                  key={item.id}
                  className="menu-item"
                  onClick={() => { setProjectMenu(false); onSwitchProject(item.id) }}
                >
                  <span>{item.name}</span>
                  <span className="hint">{item.interfaceCount} 接口</span>
                </button>
              ))}
              {otherProjects.length > 0 && <div className="menu-sep" />}
              <button
                className="menu-item project-create-item"
                onClick={() => { setProjectMenu(false); onCreateProject() }}
              >
                <span className="project-plus">+</span>
                <span>新建项目</span>
              </button>
              <div className="menu-sep" />
              <button
                className="menu-item"
                onClick={() => { setProjectMenu(false); onOpenProjectSettings() }}
              >
                <span>项目设置…</span>
              </button>
            </div>
          )}
        </div>
        <div className="env-wrap">
          <button className="picker" onClick={() => setEnvMenu((open) => !open)}>
            <Icon name="globe" size={14} />
            <span className="lbl">环境</span>
            {env ? <span className="tag-chip env-tag" style={envTagStyle(env.name)}>{env.name}</span> : <b>未设置</b>}
            {env && <code>{displayBaseUrl(env.baseUrl)}</code>}
            <Icon name="chevron" size={14} />
          </button>
          {envMenu && (
            <div className="menu env-menu">
              {envs.map((item) => (
                <button
                  key={item.id}
                  className="menu-item"
                  onClick={() => { setEnvId(item.id); setEnvMenu(false) }}
                >
                  <span className="tag-chip env-tag" style={envTagStyle(item.name)}>{item.name}</span>
                  <span className="hint mono env-menu-url">{displayBaseUrl(item.baseUrl)}</span>
                  <span className="env-menu-check">{item.id === envId ? '✓' : ''}</span>
                </button>
              ))}
              <div className="menu-sep" />
              <button className="menu-item" onClick={() => { setEnvMenu(false); setSection('envs') }}>环境设置…</button>
            </div>
          )}
        </div>
        <span className="spacer" />
        {lastRun && <span className="small-note">上次扫描 {new Date(lastRun.finishedAt).toLocaleString()}</span>}
        <button className="btn primary scan-btn" onClick={() => void openScanScope()} title="扫描代码仓库"><Icon name="repo" size={15} />扫描代码仓库</button>
        <button
          className={`ai-top-btn ${prefs?.ai?.enabled ? 'on' : ''}`}
          onClick={() => { setSettingsFocus({ section: 'ai', nonce: Date.now() }); setSection('settings') }}
          title={prefs?.ai?.enabled ? 'AI 已开启，点击进入 AI 设置' : 'AI 未开启，点击进入 AI 设置'}
          aria-label={prefs?.ai?.enabled ? 'AI 已开启，进入 AI 设置' : 'AI 未开启，进入 AI 设置'}
        >
          <span className="ai-top-robot">
            <Icon name="robot" size={17} />
            {prefs?.ai?.enabled && <i className="ai-top-dot" />}
          </span>
          <span className="ai-top-label">AI 助手</span>
        </button>
        <button className="icon-btn" onClick={onToggleTheme} title="切换主题"><Icon name={theme === 'dark' ? 'sun' : 'moon'} size={17} /></button>
      </header>

      <Message text={error} onClose={() => setError('')} />

      <div className="wsbody">
        <nav className="rail">
          <button className={`rail-btn ${section === 'interfaces' ? 'active' : ''}`} onClick={() => setSection('interfaces')}><Icon name="braces" size={19} /><span>接口</span></button>
          <button className={`rail-btn ${section === 'cases' ? 'active' : ''}`} onClick={() => setSection('cases')}><Icon name="cases" size={19} /><span>用例</span></button>
          <button className={`rail-btn ${section === 'docs' ? 'active' : ''}`} onClick={() => setSection('docs')}><Icon name="doc" size={19} /><span>文档</span></button>
          <button className={`rail-btn ${section === 'envs' ? 'active' : ''}`} onClick={() => setSection('envs')}><Icon name="globe" size={19} /><span>环境</span></button>
          <div className="rail-spacer" />
          <button className={`rail-btn ${section === 'settings' ? 'active' : ''}`} onClick={() => { setSettingsFocus(null); setSection('settings') }}><Icon name="settings" size={19} /><span>设置</span></button>
        </nav>

        {section === 'cases' ? (
          <CasesView
            project={project}
            notify={notify}
            onChanged={onChanged}
            onGoInterfaces={() => setSection('interfaces')}
            aiEnabled={prefs?.ai?.enabled ?? false}
          />
        ) : section === 'docs' ? (
          <DocsView project={project} envId={envId} notify={notify} />
        ) : section === 'envs' ? (
          <EnvsView
            project={project}
            envs={envs}
            currentEnvId={envId}
            onSelectEnv={setEnvId}
            reloadEnvs={loadEnvs}
            onChanged={onChanged}
            notify={notify}
            onBack={() => setSection(previousSection === section ? 'interfaces' : previousSection)}
          />
        ) : section === 'settings' ? (
          <SettingsView
            info={info}
            prefs={prefs}
            onPrefs={onPrefs}
            notify={notify}
            focus={settingsFocus}
            onFocusHandled={() => setSettingsFocus(null)}
          />
        ) : (
        <>
        <aside className="sidebar">
          <div className="sidebar-head">
            <h2>接口</h2><span className="count">{totalCount}</span>
            <div className="spacer" />
            <button className="btn ghost btn-sm" onClick={() => {
              const next = !allCollapsed
              const state: Record<string, boolean> = {}
              tree?.modules.forEach((module) => {
                state[module.name] = next
                module.packages.forEach((pkg) => { state[`${module.name}::${pkg.name}`] = next })
              })
              tree?.manualDirectories.forEach((directory) => { state[directory.id] = next })
              setCollapsed(state)
            }}>{allCollapsed ? '展开全部' : '收起全部'}</button>
            <div className="create-wrap" ref={createMenuRef}>
              <button className="icon-btn sm" onClick={() => setCreateMenuOpen((open) => !open)} title="新建"><Icon name="plus" size={15} /></button>
              {createMenuOpen && (
                <div className="menu create-menu">
                  <div className="create-grid">
                    <button className="create-card" onClick={() => openNewHttp()}>
                      <span className="create-icon"><Icon name="globe" size={18} /></span>
                      <strong>创建 HTTP</strong>
                      <span className="small-note">打开新标签</span>
                    </button>
                    <button className="create-card" onClick={() => openCreateDirectory()}>
                      <span className="create-icon"><Icon name="folder" size={18} /></span>
                      <strong>创建目录</strong>
                      <span className="small-note">整理手工接口</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
          <div className="sidebar-search">
            <Icon name="search" size={14} />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索路径 / 名称 / 控制器" />
          </div>
          <div className="filter-row">
            {['ALL', 'GET', 'POST', 'PUT', 'PATCH', 'DELETE'].map((item) => (
              <button
                key={item}
                className={`filter-chip ${item !== 'ALL' ? 'm-' + item.toLowerCase() : ''} ${method === item ? 'on' : ''}`}
                onClick={() => setMethod(item)}
              >
                {item}
              </button>
            ))}
          </div>
          <div className="tree">
            {filteredModules.map((module) => {
              const isCollapsed = collapsed[module.name] === true
              return (
                <div className="tree-module" key={module.name}>
                  <button className="tree-module-head" onClick={() => setCollapsed((state) => ({ ...state, [module.name]: !isCollapsed }))}>
                    <span className={`caret ${isCollapsed ? 'closed' : ''}`}>▾</span>
                    <span className="mod-name">{module.name}</span>
                    <span className="count">{module.interfaceCount}</span>
                  </button>
                  {!isCollapsed && module.packages.map((pkg) => {
                    const pkgKey = `${module.name}::${pkg.name}`
                    const pkgCollapsed = collapsed[pkgKey] === true
                    return (
                    <div className="tree-group" key={pkg.name}>
                      <button
                        className="tree-group-head"
                        title={`${pkg.name}${pkg.displayName ? `（显示为 ${pkg.displayName}）` : ''}`}
                        onClick={() => setCollapsed((state) => ({ ...state, [pkgKey]: !pkgCollapsed }))}
                        onContextMenu={(event) => {
                          event.preventDefault()
                          setInterfaceContext(null)
                          setDirContextMenu(null)
                          setPackageContext({
                            module: module.name,
                            packageName: pkg.name,
                            label: pkg.displayName ?? '',
                            x: Math.min(event.clientX, window.innerWidth - 180),
                            y: Math.min(event.clientY, window.innerHeight - 130)
                          })
                        }}
                      >
                        <span className={`caret ${pkgCollapsed ? 'closed' : ''}`}>▾</span>
                        <span className="tree-group-name">{pkg.displayName || pkg.name}</span>
                        <span className="count">{pkg.interfaces.length}</span>
                      </button>
                      {!pkgCollapsed && pkg.interfaces.map((item) => (
                        <div
                          key={item.id}
                          className={`tree-item ${activeDetail?.id === item.id ? 'active' : ''}`}
                          role="button"
                          tabIndex={0}
                          onClick={() => void openInterface(item.id)}
                          onContextMenu={(event) => {
                            event.preventDefault()
                            setDirContextMenu(null)
                            setInterfaceContext({
                              item,
                              x: Math.min(event.clientX, window.innerWidth - 190),
                              y: Math.min(event.clientY, window.innerHeight - 250)
                            })
                          }}
                          onKeyDown={(event) => {
                            if (event.key === 'Enter' || event.key === ' ') {
                              event.preventDefault()
                              void openInterface(item.id)
                            }
                          }}
                          title={`${item.method} ${item.path}${treeLabel(item) !== item.path ? ' · ' + treeLabel(item) : ''}`}
                        >
                          <span className={`method m-${item.method.toLowerCase()}`}>{item.method}</span>
                          <span className="tree-main">
                            <span className="tree-label">{treeLabel(item)}</span>
                          </span>
                          {item.status === 'changed' && <span className="chip warn">变更</span>}
                          {item.status === 'archived' && <span className="chip muted">归档</span>}
                        </div>
                      ))}
                    </div>
                    )
                  })}
                </div>
              )
            })}
            {filteredDirectories
              .filter((directory) => !directory.parentId || !filteredDirectories.some((parent) => parent.id === directory.parentId))
              .map((directory) => renderDirectory(directory, 0))}
            {filteredManual.length > 0 && (
              <div className="tree-module">
                <div className="tree-module-head static">
                  <span className="mod-name">{filteredDirectories.length > 0 ? '未分组' : '手工接口'}</span>
                  <span className="count">{filteredManual.length}</span>
                </div>
                {filteredManual.map(manualItem)}
              </div>
            )}
            {tree && !isFiltering && filteredModules.length === 0 && filteredDirectories.length === 0 && filteredManual.length === 0 && (
              <button
                type="button"
                className="tree-empty-state"
                onClick={() => void openScanScope()}
                aria-label="扫描代码仓库生成接口"
                title="扫描代码仓库生成接口"
              >
                <span className="empty-flow">
                  <span className="empty-node">
                    <Icon name="repo" size={21} />
                    <span className="empty-node-badge"><Icon name="plus" size={8} /></span>
                  </span>
                  <span className="empty-arrow">→</span>
                  <span className="empty-interface-stack">
                    <span className="empty-iface"><i className="empty-method m-get" /><i className="empty-line" /></span>
                    <span className="empty-iface"><i className="empty-method m-post" /><i className="empty-line" /></span>
                    <span className="empty-iface"><i className="empty-method m-put" /><i className="empty-line" /></span>
                  </span>
                </span>
                <span className="empty-scan-glyph"><Icon name="scan" size={13} /></span>
                <span className="tree-empty-text">
                  <strong>扫描代码仓库</strong>
                  <small>从 Spring Boot 源码生成接口</small>
                </span>
              </button>
            )}
          </div>
          <div className="sidebar-foot">
            <span className="dot ok" /> 已注册 {registeredCount}
            <span className="spacer" />
            {lastRun ? new Date(lastRun.finishedAt).toLocaleTimeString() : '未扫描'}
          </div>
        </aside>

        <section className="main detail-main">
          {(tabs.length > 0 || newHttpOpen) && (
            <div className="detail-tabs">
              {tabs.map((tab) => (
                <div
                  key={tab.id}
                  className={`detail-tab ${tab.id === activeTabId ? 'active' : ''}`}
                  role="button"
                  tabIndex={0}
                  onClick={() => setActiveTabId(tab.id)}
                  onContextMenu={(event) => openTabContext(event, tab.id)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault()
                      setActiveTabId(tab.id)
                    }
                  }}
                  title={`${tab.method} ${tab.path} · 右键更多`}
                >
                  <span className={`method m-${tab.method.toLowerCase()}`}>{tab.method}</span>
                  <span className="detail-tab-label">{tab.name || tab.path}</span>
                  <button
                    className="detail-tab-close"
                    title="关闭标签"
                    onClick={(event) => { event.stopPropagation(); closeTab(tab.id) }}
                  >
                    ×
                  </button>
                </div>
              ))}
              {newHttpOpen && (
                <div
                  className={`detail-tab new-http-tab ${activeTabId === NEW_HTTP_ID ? 'active' : ''}`}
                  role="button"
                  tabIndex={0}
                  onClick={() => setActiveTabId(NEW_HTTP_ID)}
                  onContextMenu={(event) => openTabContext(event, NEW_HTTP_ID)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault()
                      setActiveTabId(NEW_HTTP_ID)
                    }
                  }}
                >
                  <span className="chip muted">HTTP</span>
                  <span className="detail-tab-label">新建 HTTP</span>
                  <button
                    className="detail-tab-close"
                    title="关闭标签"
                    onClick={(event) => { event.stopPropagation(); closeTab(NEW_HTTP_ID) }}
                  >
                    ×
                  </button>
                </div>
              )}
            </div>
          )}
          <div className="detail-tab-panes">
            {newHttpOpen && (
              <div className={`detail-tab-pane ${activeTabId === NEW_HTTP_ID ? 'active' : ''}`}>
                <NewHttpPanel
                  projectId={project.id}
                  directories={tree?.manualDirectories ?? []}
                  initialDirectoryId={newHttpDirectoryId}
                  onCreated={handleHttpCreated}
                  onCancel={() => closeTab(NEW_HTTP_ID)}
                  notify={notify}
                />
              </div>
            )}
            {env && tabs.map((tab) => (
              <div key={tab.id} className={`detail-tab-pane ${tab.id === activeTabId ? 'active' : ''}`}>
                <RequestPanel
                  project={project}
                  detail={tab}
                  env={env}
                  onConfirm={() => void confirmChange()}
                  onRestore={() => void restore()}
                  onRefresh={async () => {
                    await loadCatalog()
                    await reloadInterface(tab.id)
                  }}
                  onCaseSaved={onChanged}
                  active={tab.id === activeTabId}
                  aiEnabled={prefs?.ai?.enabled ?? false}
                  notify={notify}
                />
              </div>
            ))}
            {tabs.length === 0 && !newHttpOpen && (
              <div className="resp-empty">
                <div className="send-glyph">➤</div>
                <strong>选择一个接口开始</strong>
                <span className="small-note">左侧选择接口后，可查看契约、切换环境并发送请求。</span>
              </div>
            )}
          </div>
        </section>
        </>
        )}
      </div>

      {scan && (
        <div className="modal-layer">
          <div className="modal scan-progress-modal">
            <div className="scan-progress-head">
              <div className="scan-radar"><span /><span /></div>
              <div>
                <h2>扫描代码仓库</h2>
                <p className="small-note">正在解析源码、生成接口契约…</p>
              </div>
              <span className="spacer" />
              <strong className="scan-percent">{scan.percent}%</strong>
            </div>
            <div className="scan-progress-track"><span style={{ width: `${scan.percent}%` }} /></div>
            <div className="scan-log">
              {scan.logs.length === 0 && <div>正在准备扫描…</div>}
              {scan.logs.map((line, index) => <div key={index}>{line}</div>)}
              <div className="scan-cursor">▋</div>
            </div>
            <div className="modal-foot">
              <span className="small-note">{scan.logs[scan.logs.length - 1] ?? '准备中'}</span>
              <div className="spacer" />
              <button className="btn" onClick={() => void cancelScan()}>取消扫描</button>
            </div>
          </div>
        </div>
      )}

      {scopeOpen && (
        <div className="modal-layer" onClick={(event) => { if (event.target === event.currentTarget) setScopeOpen(false) }}>
          <div className="modal">
            <h2>选择扫描范围</h2>
            <label className={`scope ${scopeType === 'all' ? 'on' : ''}`} onClick={() => setScopeType('all')}>
              <span className="scope-title"><span className="scope-icon"><Icon name="repo" size={14} /></span><strong>整个工程</strong></span>
              <span className="small-note">扫描全部 Spring 接口，并按快照比对</span>
            </label>
            <label className={`scope ${scopeType === 'directory' ? 'on' : ''}`} onClick={() => setScopeType('directory')}>
              <span className="scope-title"><span className="scope-icon"><Icon name="folder" size={14} /></span><strong>指定目录</strong></span>
              <span className="small-note">只扫描一个子目录</span>
              {scopeType === 'directory' && (
                <span className="input-row" onClick={(event) => event.stopPropagation()}>
                  <input value={scopeDir} onChange={(event) => setScopeDir(event.target.value)} placeholder="src/main/java/com/demo/user" />
                  <button className="btn" onClick={async () => {
                    try {
                      const picked = await unwrap(window.feelpost.dialog.chooseDirectory())
                      if (picked) setScopeDir(picked.path)
                    } catch (err) { setError((err as Error).message) }
                  }}>选择目录</button>
                </span>
              )}
            </label>
            <label className={`scope ${scopeType === 'modules' ? 'on' : ''}`} onClick={() => setScopeType('modules')}>
              <span className="scope-title"><span className="scope-icon"><Icon name="package" size={14} /></span><strong>指定模块</strong></span>
              <span className="small-note">只扫描选中的 Maven 模块</span>
              {scopeType === 'modules' && (
                <div className="module-picker" onClick={(event) => event.stopPropagation()}>
                  {modules.length > 0 && (
                    <div className="module-picker-head">
                      <label className="module-check module-select-all">
                        <input
                          type="checkbox"
                          checked={modules.length > 0 && selectedModules.size === modules.length}
                          ref={(element) => {
                            if (element) element.indeterminate = selectedModules.size > 0 && selectedModules.size < modules.length
                          }}
                          onChange={(event) => {
                            setSelectedModules(event.target.checked ? new Set(modules.map((module) => module.path)) : new Set())
                          }}
                        />
                        <span>全选</span>
                      </label>
                      <span className="small-note">{selectedModules.size}/{modules.length}</span>
                    </div>
                  )}
                  {modules.length === 0 ? (
                    <span className="small-note">未检测到 Maven 模块</span>
                  ) : modules.map((module) => (
                    <label className="module-check" key={module.path}>
                      <input
                        type="checkbox"
                        checked={selectedModules.has(module.path)}
                        onChange={(event) => {
                          const next = new Set(selectedModules)
                          if (event.target.checked) next.add(module.path)
                          else next.delete(module.path)
                          setSelectedModules(next)
                        }}
                      />
                      <span>{module.name}</span>
                      <span className="small-note mono">{module.path}</span>
                    </label>
                  ))}
                </div>
              )}
            </label>
            <div className="modal-foot">
              <button className="btn ghost" onClick={() => setScopeOpen(false)}>取消</button>
              <button className="btn primary" disabled={(scopeType === 'directory' && !scopeDir.trim()) || (scopeType === 'modules' && selectedModules.size === 0)} onClick={() => void startScan()}>开始扫描</button>
            </div>
          </div>
        </div>
      )}

      {scanResult && (
        <div className="modal-layer">
          <div className={`modal wide scan-result-modal ${scanResult.candidates.length === 0 ? 'empty' : ''}`}>
            <h2>扫描结果 <span className="small-note">范围：{scanResult.scope.type === 'all' ? '整个工程' : scanResult.scope.type === 'modules' ? `模块 ${scanResult.scope.modules?.join('、')}` : scanResult.scope.directory}</span></h2>
            {scanResult.summary.uncomparedModules.length > 0 && (
              <div className="note">本次未比对模块：{scanResult.summary.uncomparedModules.join('、')}</div>
            )}
            <div className="result-toolbar">
              <input
                value={resultQuery}
                onChange={(event) => setResultQuery(event.target.value)}
                placeholder="搜索接口名称 / 路径"
              />
              <SelectMenu
                value={resultMethod}
                onChange={setResultMethod}
                options={[
                  { value: 'ALL', label: '全部方法' },
                  { value: 'GET', label: 'GET' },
                  { value: 'POST', label: 'POST' },
                  { value: 'PUT', label: 'PUT' },
                  { value: 'PATCH', label: 'PATCH' },
                  { value: 'DELETE', label: 'DELETE' }
                ]}
              />
              <span className="small-note">{filteredCandidates.length} / {scanResult.candidates.length} 项</span>
            </div>
            <div className="result-list">
              {scanResult.candidates.length === 0 && (
                <div className="scan-result-empty">
                  <span className="scan-empty-icon"><Icon name="doc" size={30} /></span>
                  <strong>没有发现变更</strong>
                  <span className="small-note">代码仓库与当前接口资产一致，无需入库。</span>
                </div>
              )}
              {scanResult.candidates.length > 0 && candidateGroups.length === 0 && <p className="small-note">没有匹配筛选条件的接口。</p>}
              {candidateGroups.map(([moduleName, candidates]) => {
                const collapsed = resultCollapsed[moduleName] === true
                const allSelected = candidates.every((item) => selectedCandidates.has(item.candidateId))
                return (
                  <div className="result-group" key={moduleName}>
                    <div className="result-group-head">
                      <button
                        className="result-group-toggle"
                        onClick={() => setResultCollapsed((state) => ({ ...state, [moduleName]: !collapsed }))}
                      >
                        <span className={`caret ${collapsed ? 'closed' : ''}`}>▾</span>
                        <strong>{moduleName}</strong>
                        <span className="count">{candidates.length}</span>
                      </button>
                      <label className="check-wrap result-group-check" onClick={(event) => event.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={allSelected}
                          onChange={(event) => {
                            const next = new Set(selectedCandidates)
                            for (const item of candidates) {
                              if (event.target.checked) next.add(item.candidateId)
                              else next.delete(item.candidateId)
                            }
                            setSelectedCandidates(next)
                          }}
                        />
                        本组全选
                      </label>
                    </div>
                    {!collapsed && candidates.map((candidate) => (
                      <label className="result-row" key={candidate.candidateId}>
                        <input type="checkbox" checked={selectedCandidates.has(candidate.candidateId)} onChange={(event) => {
                          const next = new Set(selectedCandidates)
                          if (event.target.checked) next.add(candidate.candidateId)
                          else next.delete(candidate.candidateId)
                          setSelectedCandidates(next)
                        }} />
                        <span className={`method m-${candidate.method.toLowerCase()}`}>{candidate.method}</span>
                        <span className="mono">{candidate.path}</span>
                        <span className="small-note">{candidate.name}</span>
                        <span className={`chip ${candidate.kind === 'new' ? 'ok' : candidate.kind === 'changed' ? 'warn' : 'muted'}`}>
                          {candidate.kind === 'new' ? '新增' : candidate.kind === 'changed' ? '变更' : '删除'}
                        </span>
                      </label>
                    ))}
                  </div>
                )
              })}
            </div>
            <div className="modal-foot">
              <span className="small-note">已选择 {selectedCandidates.size} 项</span>
              <div className="spacer" />
              <button className="btn ghost" onClick={() => setScanResult(null)}>取消</button>
              <button className="btn primary" disabled={selectedCandidates.size === 0} onClick={() => void applyScan()}>确认入库</button>
            </div>
          </div>
        </div>
      )}

      {tabContext && (
        <div className="context-menu" ref={tabContextRef} style={{ left: tabContext.x, top: tabContext.y }}>
          <button className="context-item" onClick={() => { setTabContext(null); closeTab(tabContext.id) }}><span className="context-icon"><Icon name="close" size={13} /></span>关闭当前</button>
          <button className="context-item" onClick={() => { setTabContext(null); closeAllTabs() }}><span className="context-icon"><Icon name="all" size={13} /></span>关闭所有</button>
          <button className="context-item" disabled={tabContext.id === NEW_HTTP_ID ? tabs.length === 0 : tabs.findIndex((tab) => tab.id === tabContext.id) <= 0} onClick={() => { setTabContext(null); closeTabsLeft(tabContext.id) }}><span className="context-icon"><Icon name="left" size={13} /></span>关闭左侧</button>
          <button className="context-item" disabled={tabContext.id === NEW_HTTP_ID ? true : !newHttpOpen && tabs.findIndex((tab) => tab.id === tabContext.id) === tabs.length - 1} onClick={() => { setTabContext(null); closeTabsRight(tabContext.id) }}><span className="context-icon"><Icon name="right" size={13} /></span>关闭右侧</button>
        </div>
      )}

      {interfaceContext && (
        <div className="context-menu" ref={interfaceContextRef} style={{ left: interfaceContext.x, top: interfaceContext.y }}>
          <button className="context-item" onClick={() => { setInterfaceContext(null); void copyInterfaceCurl(interfaceContext.item) }}><span className="context-icon"><Icon name="send" size={13} /></span>复制 cURL 命令</button>
          <button className="context-item" onClick={() => { setInterfaceContext(null); void exportInterfaceDoc(interfaceContext.item) }}><span className="context-icon"><Icon name="doc" size={13} /></span>导出</button>
          {interfaceContext.item.source === 'manual' && (
            <button className="context-item" onClick={() => openMoveInterface(interfaceContext.item)}><span className="context-icon"><Icon name="folder" size={13} /></span>移动至…</button>
          )}
          <button className="context-item" onClick={() => { setInterfaceContext(null); void copyInterfaceAddress(interfaceContext.item) }}><span className="context-icon"><Icon name="copy" size={13} /></span>复制</button>
          <button className="context-item" onClick={() => void cloneInterface(interfaceContext.item)}><span className="context-icon"><Icon name="clone" size={13} /></span>克隆</button>
          <div className="menu-sep" />
          <button className="context-item danger-text" onClick={() => { setInterfaceContext(null); setDeletingInterface(interfaceContext.item) }}><span className="context-icon"><Icon name="trash" size={13} /></span>删除</button>
        </div>
      )}

      {movingInterface && (
        <div className="modal-layer" onClick={(event) => { if (event.target === event.currentTarget) setMovingInterface(null) }}>
          <div className="modal select-modal">
            <h2>移动接口</h2>
            <p>将「{movingInterface.name}」移动到：</p>
            <label className="field">
              <span>目标目录</span>
              <SelectMenu
                value={moveDirectoryId || 'NONE'}
                onChange={(value) => setMoveDirectoryId(value === 'NONE' ? '' : value)}
                options={[{ value: 'NONE', label: '未分组' }, ...(tree?.manualDirectories ?? []).map((directory) => ({ value: directory.id, label: directory.name }))]}
              />
            </label>
            <div className="modal-foot">
              <button className="btn ghost" onClick={() => setMovingInterface(null)}>取消</button>
              <button className="btn primary" disabled={interfaceBusy} onClick={() => void moveInterface()}>{interfaceBusy ? '移动中…' : '移动'}</button>
            </div>
          </div>
        </div>
      )}

      {deletingInterface && (
        <div className="modal-layer" onClick={(event) => { if (event.target === event.currentTarget) setDeletingInterface(null) }}>
          <div className="modal">
            <h2>删除接口</h2>
            <p>确定删除接口「{deletingInterface.name}」吗？</p>
            <div className="note warn">接口定义会被删除，已保存用例会保留但标记接口不存在。</div>
            <div className="modal-foot">
              <button className="btn ghost" onClick={() => setDeletingInterface(null)}>取消</button>
              <button className="btn danger" disabled={interfaceBusy} onClick={() => void removeInterface()}>{interfaceBusy ? '删除中…' : '确认删除'}</button>
            </div>
          </div>
        </div>
      )}

      {dirActionMenu && (
        <div className="context-menu" ref={dirActionRef} style={{ left: dirActionMenu.x, top: dirActionMenu.y }}>
          {dirActionMenu.kind === 'new' ? (
            <>
              <button className="context-item" onClick={() => { setDirActionMenu(null); openCreateDirectory(dirActionMenu.directory.id) }}><span className="context-icon"><Icon name="folder" size={13} /></span>目录</button>
              <button className="context-item" onClick={() => { setDirActionMenu(null); openNewHttp(dirActionMenu.directory.id) }}><span className="context-icon"><Icon name="globe" size={13} /></span>HTTP</button>
            </>
          ) : (
            <>
              <button
                className="context-item context-submenu-trigger"
                onMouseEnter={() => setDirSubmenuOpen(true)}
                onClick={() => setDirSubmenuOpen((open) => !open)}
              >
                <span className="context-icon"><Icon name="plus" size={13} /></span>新建<span className="context-submenu-caret">›</span>
              </button>
              {dirSubmenuOpen && (
                <div className="context-submenu">
                  <button className="context-item" onClick={() => { setDirActionMenu(null); openCreateDirectory(dirActionMenu.directory.id) }}><span className="context-icon"><Icon name="folder" size={13} /></span>目录</button>
                  <button className="context-item" onClick={() => { setDirActionMenu(null); openNewHttp(dirActionMenu.directory.id) }}><span className="context-icon"><Icon name="globe" size={13} /></span>HTTP</button>
                </div>
              )}
              <button className="context-item" onClick={() => openMoveDirectory(dirActionMenu.directory)}><span className="context-icon"><Icon name="folder" size={13} /></span>移动至…</button>
              <button className="context-item" onClick={() => { setDirActionMenu(null); openEditDirectory(dirActionMenu.directory) }}><span className="context-icon"><Icon name="edit" size={13} /></span>编辑</button>
              <div className="menu-sep" />
              <button className="context-item danger-text" onClick={() => { setDirActionMenu(null); setDeletingDirectory(dirActionMenu.directory) }}><span className="context-icon"><Icon name="trash" size={13} /></span>删除</button>
            </>
          )}
        </div>
      )}

      {movingDirectory && (
        <div className="modal-layer" onClick={(event) => { if (event.target === event.currentTarget) setMovingDirectory(null) }}>
          <div className="modal select-modal">
            <h2>移动目录</h2>
            <p>将「{movingDirectory.name}」移动到：</p>
            <label className="field">
              <span>目标目录</span>
              <SelectMenu
                value={moveDirParentId || 'NONE'}
                onChange={(value) => setMoveDirParentId(value === 'NONE' ? '' : value)}
                options={directoryMoveOptions(movingDirectory)}
              />
            </label>
            <div className="modal-foot">
              <button className="btn ghost" onClick={() => setMovingDirectory(null)}>取消</button>
              <button className="btn primary" onClick={() => void saveDirectoryMove()}>移动</button>
            </div>
          </div>
        </div>
      )}

      {dirContextMenu && (
        <div className="context-menu" ref={dirContextRef} style={{ left: dirContextMenu.x, top: dirContextMenu.y }}>
          <button className="context-item" onClick={() => { setDirContextMenu(null); openCreateDirectory(dirContextMenu.directory.id) }}><span className="context-icon"><Icon name="folder" size={13} /></span>新建子目录</button>
          <button className="context-item" onClick={() => openMoveDirectory(dirContextMenu.directory)}><span className="context-icon"><Icon name="folder" size={13} /></span>移动至…</button>
          <button className="context-item" onClick={() => void copyDirectory(dirContextMenu.directory)}><span className="context-icon"><Icon name="copy" size={13} /></span>复制目录</button>
          <button className="context-item" onClick={() => openEditDirectory(dirContextMenu.directory)}><span className="context-icon"><Icon name="edit" size={13} /></span>编辑目录</button>
          <div className="menu-sep" />
          <button className="context-item danger-text" onClick={() => { setDirContextMenu(null); setDeletingDirectory(dirContextMenu.directory) }}><span className="context-icon"><Icon name="trash" size={13} /></span>删除目录</button>
        </div>
      )}

      {packageContext && (
        <div className="context-menu" ref={packageContextRef} style={{ left: packageContext.x, top: packageContext.y }}>
          <button className="context-item" onClick={() => { setPackageRename({ module: packageContext.module, packageName: packageContext.packageName, label: packageContext.label }); setPackageContext(null) }}><span className="context-icon"><Icon name="edit" size={13} /></span>重命名包显示名称</button>
          {packageContext.label && <button className="context-item" disabled={packageBusy} onClick={() => void resetPackageAlias()}><span className="context-icon"><Icon name="edit" size={13} /></span>恢复原包名</button>}
        </div>
      )}

      {packageRename && (
        <div className="modal-layer" onClick={(event) => { if (event.target === event.currentTarget) setPackageRename(null) }}>
          <div className="modal">
            <h2>重命名包显示名称</h2>
            <p className="small-note">仅修改 FeelPost 中的显示名称，不修改源码包名；留空恢复原包名。</p>
            <label className="field"><span>当前包</span><input className="input" value={packageRename.packageName} readOnly /></label>
            <label className="field"><span>显示名称</span><input className="input" value={packageRename.label} autoFocus placeholder={packageRename.packageName} onChange={(event) => setPackageRename({ ...packageRename, label: event.target.value })} /></label>
            <div className="modal-foot">
              <button className="btn ghost" onClick={() => setPackageRename(null)}>取消</button>
              <button className="btn primary" disabled={packageBusy} onClick={() => void savePackageRename()}>{packageBusy ? '保存中…' : '保存'}</button>
            </div>
          </div>
        </div>
      )}

      {deletingDirectory && (
        <div className="modal-layer" onClick={(event) => { if (event.target === event.currentTarget) setDeletingDirectory(null) }}>
          <div className="modal">
            <h2>删除目录</h2>
            <p>确定删除目录「{deletingDirectory.name}」吗？</p>
            <div className="note warn">目录内的接口会保留并移动到「未分组」，不会删除接口。</div>
            <div className="modal-foot">
              <button className="btn ghost" onClick={() => setDeletingDirectory(null)}>取消</button>
              <button className="btn danger" disabled={directoryBusy} onClick={() => void removeDirectory()}>{directoryBusy ? '删除中…' : '确认删除'}</button>
            </div>
          </div>
        </div>
      )}

      {directoryOpen && (
        <div className="modal-layer" onClick={(event) => { if (event.target === event.currentTarget) setDirectoryOpen(false) }}>
          <div className="modal">
            <h2>{editingDirectoryId ? '编辑目录' : '创建目录'}</h2>
            <p className="small-note">目录用于整理手工接口，不参与源码扫描。{directoryForm.parentId ? ' 将在当前目录下创建子目录。' : ''}</p>
            <label className="field"><span>目录名称</span><input value={directoryForm.name} autoFocus onChange={(event) => setDirectoryForm({ ...directoryForm, name: event.target.value })} placeholder="例如：内部工具" /></label>
            <label className="field"><span>目录说明</span><input value={directoryForm.description} onChange={(event) => setDirectoryForm({ ...directoryForm, description: event.target.value })} placeholder="可选" /></label>
            {directoryError && <div className="note warn">{directoryError}</div>}
            <div className="modal-foot">
              <button className="btn ghost" onClick={() => setDirectoryOpen(false)}>取消</button>
              <button className="btn primary" disabled={directoryBusy || !directoryForm.name.trim()} onClick={() => void saveDirectory()}>{directoryBusy ? '保存中…' : editingDirectoryId ? '保存目录' : '创建目录'}</button>
            </div>
          </div>
        </div>
      )}


    </div>
  )
}
