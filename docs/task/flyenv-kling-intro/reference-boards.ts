import { mkdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import sharp from 'sharp'
import { MODULES, REPO_ROOT, type ModuleSpec, partitionModules } from './module-manifest.ts'

export const BOARD_FILES = [
  'modules-a.png',
  'modules-b.png',
  'modules-c.png',
  'flyenv-logo.png',
  'spatial-style.png',
  'end-card.png'
] as const

const WIDTH = 1920
const HEIGHT = 1080
const logoPath = path.join(REPO_ROOT, 'src/render/assets/256x256.png')

function escapeXml(value: string): string {
  return value.replace(
    /[<>&"']/g,
    (char) =>
      (
        {
          '<': '&lt;',
          '>': '&gt;',
          '&': '&amp;',
          '"': '&quot;',
          "'": '&apos;'
        } as Record<string, string>
      )[char]
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
      <radialGradient id="bg"><stop stop-color="#173b72"/><stop offset="0.48" stop-color="#07152d"/><stop offset="1" stop-color="#01030b"/></radialGradient>
      <filter id="glow"><feGaussianBlur stdDeviation="12" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
    </defs>
    <rect width="1920" height="1080" fill="url(#bg)"/>
    ${content}
  </svg>`
}

async function moduleBoardSvg(
  items: readonly ModuleSpec[],
  boardName: string
): Promise<string> {
  const cards = await Promise.all(
    items.map(async (item, index) => {
      const column = index % 2
      const row = Math.floor(index / 2)
      const x = 130 + column * 850
      const y = 170 + row * 210
      const icon = await dataUri(path.join(REPO_ROOT, item.asset))
      return `<g transform="translate(${x} ${y})">
      <rect width="790" height="174" rx="28" fill="#07152a" fill-opacity="0.92" stroke="#62ddff" stroke-width="3"/>
      <image href="${icon}" x="34" y="27" width="120" height="120" preserveAspectRatio="xMidYMid meet"/>
      <text x="190" y="108" fill="#ffffff" font-size="54" font-weight="700" font-family="Arial, Helvetica, sans-serif">${escapeXml(item.name)}</text>
    </g>`
    })
  )
  return documentSvg(
    `<text x="130" y="105" fill="#76e7ff" font-size="44" font-weight="700" font-family="Arial, Helvetica, sans-serif">FlyEnv modules · ${boardName}</text>${cards.join('')}`
  )
}

async function logoBoardSvg(): Promise<string> {
  const logo = await dataUri(logoPath)
  return documentSvg(`<circle cx="960" cy="510" r="360" fill="none" stroke="#5adfff" stroke-width="4" opacity="0.45" filter="url(#glow)"/>
    <image href="${logo}" x="610" y="160" width="700" height="700"/>
    <text x="960" y="945" text-anchor="middle" fill="#ffffff" font-size="64" font-weight="700" font-family="Arial, Helvetica, sans-serif">Preserve the official three-switch structure</text>`)
}

async function styleBoardSvg(): Promise<string> {
  const logo = await dataUri(logoPath)
  const plaques = Array.from({ length: 16 }, (_, index) => {
    const angle = (index / 16) * Math.PI * 2
    const x = 960 + Math.cos(angle) * (index % 2 === 0 ? 690 : 520)
    const y = 520 + Math.sin(angle) * (index % 3 === 0 ? 350 : 270)
    const scale = index % 4 === 0 ? 1.35 : index % 3 === 0 ? 0.72 : 1
    return `<g transform="translate(${x - 95} ${y - 32}) scale(${scale})"><rect width="190" height="64" rx="15" fill="#081a36" stroke="#63e2ff" stroke-width="2"/><circle cx="34" cy="32" r="17" fill="#6be5ff"/><rect x="65" y="23" width="100" height="18" rx="9" fill="#ffffff"/></g>`
  }).join('')
  return documentSvg(`<ellipse cx="960" cy="520" rx="760" ry="340" fill="none" stroke="#67ddff" stroke-width="4" opacity="0.55" transform="rotate(-11 960 520)"/>
    <g transform="translate(590 255) rotate(-5 370 235)"><rect width="740" height="470" rx="34" fill="#071327" stroke="#69e3ff" stroke-width="7" filter="url(#glow)"/><image href="${logo}" x="245" y="105" width="250" height="250"/></g>
    ${plaques}
    <text x="960" y="1000" text-anchor="middle" fill="#78e9ff" font-size="48" font-weight="700" font-family="Arial, Helvetica, sans-serif">Deep-blue neon · spherical Z-axis burst · cinematic 120° orbit</text>`)
}

async function endCardSvg(): Promise<string> {
  const logo = await dataUri(logoPath)
  return documentSvg(`<image href="${logo}" x="440" y="290" width="500" height="500"/>
    <text x="1010" y="600" fill="#ffffff" font-size="150" font-weight="700" letter-spacing="2" font-family="Arial, Helvetica, sans-serif">FlyEnv</text>
    <path d="M410 820 C700 700 1170 900 1510 690" fill="none" stroke="#69e5ff" stroke-width="8" filter="url(#glow)"/>`)
}

export async function renderReferenceBoards(
  outputDir = path.join(import.meta.dirname, 'references')
): Promise<void> {
  await mkdir(outputDir, { recursive: true })
  const groups = partitionModules(MODULES)
  const svgs = [
    await moduleBoardSvg(groups[0], 'A'),
    await moduleBoardSvg(groups[1], 'B'),
    await moduleBoardSvg(groups[2], 'C'),
    await logoBoardSvg(),
    await styleBoardSvg(),
    await endCardSvg()
  ]
  await Promise.all(
    svgs.map((svg, index) =>
      sharp(Buffer.from(svg)).png().toFile(path.join(outputDir, BOARD_FILES[index]))
    )
  )
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await renderReferenceBoards()
}
