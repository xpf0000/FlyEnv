import type { Config } from 'tailwindcss'
import typography from '@tailwindcss/typography'
const config: Config = {
  darkMode: 'selector',
  content: [
    './src/render/**/*.{js,ts,tsx,vue,md,html}',
    './plugins/*/render/**/*.{js,ts,tsx,vue}',
    './web/**/*.{js,ts,vue,md,html}'
  ],
  theme: {
    extend: {}
  },
  plugins: [typography]
}
export default config
