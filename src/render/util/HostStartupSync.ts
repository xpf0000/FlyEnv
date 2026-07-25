export const synchronizeHostsAtStartup = async (
  loadHosts: () => Promise<unknown>,
  writeHosts: () => Promise<unknown>
): Promise<void> => {
  await loadHosts()
  await writeHosts()
}
