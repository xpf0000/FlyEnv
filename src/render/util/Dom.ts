export const parentHas = (dom: HTMLElement, selector: string) => {
  const all = document.querySelectorAll(selector)
  return Array.from(all).some((s) => s.contains(dom))
}
