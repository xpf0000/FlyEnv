export function appendGvmTab(tabs: string[], isWindows: boolean): string[] {
  return isWindows ? [...tabs] : [...tabs, 'GVM']
}
