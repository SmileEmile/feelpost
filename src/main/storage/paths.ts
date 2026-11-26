import { join } from 'node:path'

export function projectsRoot(dataDir: string): string {
  return join(dataDir, 'projects')
}

export function projectDir(dataDir: string, projectId: string): string {
  if (!/^[a-zA-Z0-9-]+$/.test(projectId)) throw new Error(`invalid project id: ${projectId}`)
  return join(projectsRoot(dataDir), projectId)
}

export function interfacesDir(dataDir: string, projectId: string): string {
  return join(projectDir(dataDir, projectId), 'interfaces')
}

export function interfaceFile(dataDir: string, projectId: string, interfaceId: string): string {
  if (!/^[a-zA-Z0-9-]+$/.test(interfaceId)) throw new Error(`invalid interface id: ${interfaceId}`)
  return join(interfacesDir(dataDir, projectId), `${interfaceId}.json`)
}

export function casesDir(dataDir: string, projectId: string): string {
  return join(projectDir(dataDir, projectId), 'cases')
}

export function caseFile(dataDir: string, projectId: string, caseId: string): string {
  if (!/^[a-zA-Z0-9-]+$/.test(caseId)) throw new Error(`invalid case id: ${caseId}`)
  return join(casesDir(dataDir, projectId), `${caseId}.json`)
}

export function examplesDir(dataDir: string, projectId: string): string {
  return join(projectDir(dataDir, projectId), 'examples')
}

export function exampleFile(dataDir: string, projectId: string, exampleId: string): string {
  if (!/^[a-zA-Z0-9-]+$/.test(exampleId)) throw new Error(`invalid example id: ${exampleId}`)
  return join(examplesDir(dataDir, projectId), `${exampleId}.json`)
}

export function snapshotFile(dataDir: string, projectId: string): string {
  return join(projectDir(dataDir, projectId), 'scan', 'snapshot.json')
}

export function lastRunFile(dataDir: string, projectId: string): string {
  return join(projectDir(dataDir, projectId), 'scan', 'last-run.json')
}

export function aiSecretFile(dataDir: string): string {
  return join(dataDir, 'ai-secret.bin')
}

export function preferencesFile(dataDir: string): string {
  return join(dataDir, 'preferences.json')
}
