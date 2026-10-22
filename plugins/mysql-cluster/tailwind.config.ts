import type { Config } from 'tailwindcss'
import hostConfig from '../../tailwind.config'

export default {
  ...hostConfig,
  content: {
    relative: true,
    files: ['./render/**/*.{js,ts,tsx,vue}']
  }
} satisfies Config
