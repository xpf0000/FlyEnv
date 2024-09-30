import type { Config } from 'tailwindcss'

const config: Config = {
  darkMode: 'selector',
  content: ['./src/render/**/*.{js,ts,vue,md,html}', './web/**/*.{js,ts,vue,md,html}'],
  theme: {
    extend: {}
  },
  plugins: []
}
export default config
