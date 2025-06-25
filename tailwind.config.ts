import type { Config } from 'tailwindcss'
import typography from '@tailwindcss/typography'
const config: Config = {
  darkMode: 'selector',
  content: ['./src/render/**/*.{js,ts,vue,md,html}', './web/**/*.{js,ts,vue,md,html}'],
  theme: {
    extend: {}
  },
  plugins: [typography]
}
export default config
