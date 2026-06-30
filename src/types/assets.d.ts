declare module '*?raw' {
  const content: string
  export default content
}

declare module 'svg-inline-loader' {
  export function getExtractedSVG(svg: string, options?: Record<string, unknown>): string
}
