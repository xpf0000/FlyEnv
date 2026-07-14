import { mkdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import sharp from 'sharp'
import {
  MODULES,
  REPO_ROOT,
  partitionModules,
  type ModuleSpec
} from '../flyenv-kling-intro/module-manifest.ts'

export const REFERENCE_FILES = [
  'module-board-a.png',
  'module-board-b.png',
  'module-board-c.png',
  'logo-off.png',
  'end-card.png'
] as const

export const CLIP_A_REFERENCE_FILES = [
  'module-board-a.png',
  'module-board-b.png',
  'module-board-c.png',
  'logo-off.png'
] as const

export const CLIP_B_FRAME_FILES = ['logo-off.png', 'end-card.png'] as const

const WIDTH = 1920
const HEIGHT = 1080
const logoPath = path.join(REPO_ROOT, 'src/render/assets/256x256.png')

function escapeXml(value: string): string {
  return value.replace(
    /[<>&"']/g,
    (character) =>
      (
        ({
          '<': '&lt;',
          '>': '&gt;',
          '&': '&amp;',
          '"': '&quot;',
          "'": '&apos;'
        }) as Record<string, string>
      )[character]
  )
}

async function dataUri(filename: string): Promise<string> {
  const bytes = await readFile(filename)
  const mime = path.extname(filename).toLowerCase() === '.png' ? 'image/png' : 'image/svg+xml'
  return `data:${mime};base64,${bytes.toString('base64')}`
}

function documentSvg(content: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}">
    <defs>
      <radialGradient id="bg"><stop stop-color="#143866"/><stop offset="0.48" stop-color="#07162f"/><stop offset="1" stop-color="#01040d"/></radialGradient>
    </defs>
    <rect width="1920" height="1080" fill="url(#bg)"/>
    ${content}
  </svg>`
}

function solidBoardSvg(content: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}">
    <rect data-board-background="solid" width="1920" height="1080" fill="#020713"/>
    ${content}
  </svg>`
}

export async function moduleBoardSvg(items: readonly ModuleSpec[]): Promise<string> {
  const cards = await Promise.all(
    items.map(async (item, index) => {
      const column = index % 2
      const row = Math.floor(index / 2)
      const x = 90 + column * 900
      const y = 70 + row * 245
      const icon = await dataUri(path.join(REPO_ROOT, item.asset))
      return `<g transform="translate(${x} ${y})" data-module="${escapeXml(item.name)}">
        <rect width="840" height="205" rx="30" fill="#06152d" stroke="#58ddff" stroke-width="4"/>
        <rect data-icon-tile="${escapeXml(item.name)}" x="24" y="22" width="168" height="161" rx="24" fill="#f7fbff" stroke="#d9efff" stroke-width="3"/>
        <image href="${icon}" x="38" y="32" width="140" height="140" preserveAspectRatio="xMidYMid meet"/>
        <text x="264" y="128" fill="#ffffff" font-size="58" font-weight="700" font-family="Arial, Helvetica, sans-serif">${escapeXml(item.name)}</text>
      </g>`
    })
  )
  return solidBoardSvg(cards.join(''))
}

function activeSwitchOverlay(x: number, y: number, size: number): string {
  const scale = size / 256
  const tracks = [
    [153, 74, 26, 14],
    [143, 117, 26, 14],
    [133, 159, 26, 14]
  ] as const

  return tracks
    .map(([trackX, trackY, width, height], index) => {
      const px = x + trackX * scale
      const py = y + trackY * scale
      const w = width * scale
      const h = height * scale
      const radius = h / 2
      return `<g data-switch-on="${index + 1}">
        <rect x="${px}" y="${py}" width="${w}" height="${h}" rx="${radius}" fill="#20d46b"/>
        <circle cx="${px + radius}" cy="${py + radius}" r="${radius * 0.78}" fill="#ffffff"/>
      </g>`
    })
    .join('')
}

export async function logoOffSvg(): Promise<string> {
  const logo = await dataUri(logoPath)
  return documentSvg(
    `<image href="${logo}" x="660" y="240" width="600" height="600" preserveAspectRatio="xMidYMid meet"/>`
  )
}

export async function endCardSvg(): Promise<string> {
  const logo = await dataUri(logoPath)
  const logoX = 360
  const logoY = 290
  const logoSize = 500
  return documentSvg(`<image href="${logo}" x="${logoX}" y="${logoY}" width="${logoSize}" height="${logoSize}" preserveAspectRatio="xMidYMid meet"/>
    ${activeSwitchOverlay(logoX, logoY, logoSize)}
    <text x="960" y="615" fill="#ffffff" font-size="166" font-weight="700" font-family="Arial, Helvetica, sans-serif">FlyEnv</text>`)
}

export async function renderReferenceAssets(
  outputDir = path.join(import.meta.dirname, 'references')
): Promise<void> {
  await mkdir(outputDir, { recursive: true })
  const groups = partitionModules(MODULES)
  const svgs = [
    await moduleBoardSvg(groups[0]),
    await moduleBoardSvg(groups[1]),
    await moduleBoardSvg(groups[2]),
    await logoOffSvg(),
    await endCardSvg()
  ]

  await Promise.all(
    svgs.map((svg, index) =>
      sharp(Buffer.from(svg)).png().toFile(path.join(outputDir, REFERENCE_FILES[index]))
    )
  )
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await renderReferenceAssets()
}
