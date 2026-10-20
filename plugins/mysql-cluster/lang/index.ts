import en from './en'
import zh from './zh'
export const createT = (locale: () => string) => (key: string): string => {
  const dictionary = /^zh(?:-|$)/i.test(locale()) ? zh : en
  return dictionary[key] ?? en[key] ?? key
}
