/** Verified against official download JSON and ranged ZIP metadata on 2026-10-16.
 * ISO digests come from each official archive's iso_SHA256.txt, not a fabricated ZIP hash.
 */
export const DAMENG_PACKAGES = [
  {
    id: 'win20260709',
    platform: 'win32',
    version: '8.20260709.0',
    name: 'DM8 · Windows x64 · 2026-07-09',
    url: 'https://download.dameng.com/eco/adapter/DM8/202607/dm8_20260709_x86_win_64.zip',
    zipSize: 517335198,
    isoName: 'dm8_20260709_x86_win_64.iso',
    isoSize: 907055104,
    compressedSize: 517334716,
    localOffset: 0,
    isoSha256: 'bd1465274838ef837abcb84b7e311c879723a7d678bc7360f85150b1b12065a0'
  },
  {
    id: 'ubuntu2220260817',
    platform: 'linux',
    version: '8.20260817.0',
    name: 'DM8 · Ubuntu 22.04 x64 · 2026-08-17',
    url: 'https://download.dameng.com/eco/adapter/DM8/202608/dm8_20260817_x86_Ubuntu22_64.zip',
    zipSize: 860349960,
    isoName: 'dm8_20260817_x86_Ubuntu22_64.iso',
    isoSize: 877658112,
    compressedSize: 860349132,
    localOffset: 241,
    isoSha256: 'fb631279a60fa2fb814179fa712d4847aef32c9a2e694da5f93241d0fdef9d54'
  }
] as const
export type DamengPackage = (typeof DAMENG_PACKAGES)[number]

export function packageById(id: unknown): DamengPackage {
  const item = DAMENG_PACKAGES.find((entry) => entry.id === id)
  if (!item) throw new Error('Unknown DM package. Refresh the official catalog.')
  return item
}
