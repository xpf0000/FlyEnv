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
  'end-card.png',
  'interior-camera.png'
] as const

export const CLIP_A_REFERENCE_FILES = [
  'module-board-a.png',
  'module-board-b.png',
  'module-board-c.png',
  'logo-off.png',
  'interior-camera.png'
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
      <radialGradient id="dome"><stop stop-color="#071b39"/><stop offset="0.72" stop-color="#041027"/><stop offset="1" stop-color="#00030b"/></radialGradient>
      <filter id="glow"><feGaussianBlur stdDeviation="11" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
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

type InteriorDepth = 'far' | 'middle' | 'foreground'

interface InteriorPlaque {
  depth: InteriorDepth
  path: string
}

const INTERIOR_PLAQUES: readonly InteriorPlaque[] = [
  { depth: 'far', path: 'M690 170 L870 135 L885 205 L700 245 Z' },
  { depth: 'far', path: 'M1030 115 L1210 150 L1195 225 L1015 190 Z' },
  { depth: 'far', path: 'M520 330 L745 285 L760 380 L505 430 Z' },
  { depth: 'far', path: 'M865 300 L1070 292 L1075 382 L855 390 Z' },
  { depth: 'far', path: 'M1210 355 L1445 405 L1420 500 L1195 450 Z' },
  { depth: 'far', path: 'M620 590 L835 555 L850 650 L605 690 Z' },
  { depth: 'far', path: 'M960 535 L1170 555 L1160 650 L945 620 Z' },
  { depth: 'far', path: 'M1100 735 L1280 770 L1260 850 L1080 815 Z' },
  { depth: 'middle', path: 'M40 40 L520 -10 L580 190 L90 280 Z' },
  { depth: 'middle', path: 'M1300 -10 L1800 70 L1720 260 L1260 170 Z' },
  { depth: 'middle', path: 'M-60 310 L420 250 L480 520 L-80 600 Z' },
  { depth: 'middle', path: 'M1490 250 L2010 350 L1980 650 L1430 545 Z' },
  { depth: 'middle', path: 'M50 680 L540 760 L480 1030 L-20 900 Z' },
  { depth: 'middle', path: 'M1280 760 L1790 670 L1900 930 L1350 1040 Z' },
  { depth: 'foreground', path: 'M-350 -250 L600 -100 L520 310 L-260 420 Z' },
  { depth: 'foreground', path: 'M1430 -160 L2320 -40 L2180 470 L1360 300 Z' },
  { depth: 'foreground', path: 'M-350 690 L520 780 L620 1280 L-280 1180 Z' },
  { depth: 'foreground', path: 'M1380 720 L2280 650 L2350 1200 L1290 1280 Z' }
] as const

const INTERIOR_DEPTH_STYLE: Record<
  InteriorDepth,
  { fill: string; stroke: string; fillOpacity: number; strokeOpacity: number; strokeWidth: number }
> = {
  far: {
    fill: '#071a34',
    stroke: '#35769d',
    fillOpacity: 0.64,
    strokeOpacity: 0.62,
    strokeWidth: 3
  },
  middle: {
    fill: '#082342',
    stroke: '#4cc8e8',
    fillOpacity: 0.82,
    strokeOpacity: 0.86,
    strokeWidth: 5
  },
  foreground: {
    fill: '#0a2d50',
    stroke: '#6ce9ff',
    fillOpacity: 0.94,
    strokeOpacity: 1,
    strokeWidth: 8
  }
}

export function interiorCameraSvg(): string {
  const plaques = INTERIOR_PLAQUES.map((plaque, index) => {
    const style = INTERIOR_DEPTH_STYLE[plaque.depth]
    const glow = plaque.depth === 'foreground' ? ' filter="url(#glow)"' : ''
    return `<g data-plaque="${index + 1}" data-depth="${plaque.depth}" data-blank-plaque="true"${glow}>
      <path d="${plaque.path}" fill="${style.fill}" fill-opacity="${style.fillOpacity}" stroke="${style.stroke}" stroke-opacity="${style.strokeOpacity}" stroke-width="${style.strokeWidth}"/>
    </g>`
  }).join('')

  return documentSvg(`<g data-camera="inside-sphere-pov">
    <rect width="1920" height="1080" fill="url(#dome)"/>
    <path d="M960 500 L40 0 L0 0 L0 1080 L80 1080 Z" fill="#0b3156" opacity="0.12"/>
    <path d="M960 500 L1880 0 L1920 0 L1920 1080 L1840 1080 Z" fill="#14365a" opacity="0.1"/>
    <path d="M960 480 L1320 1080 L600 1080 Z" fill="#071d38" opacity="0.2"/>
    ${plaques}
  </g>`)
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
    await endCardSvg(),
    interiorCameraSvg()
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
