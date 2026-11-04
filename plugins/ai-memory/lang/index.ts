import en from './en'
import zh from './zh'
export const createMemoryT = (locale: () => string) => (key: string) => {
  const messages: Record<string, string> = locale().toLowerCase().startsWith('zh') ? zh : en
  return messages[key] ?? (en as Record<string, string>)[key] ?? key
}
