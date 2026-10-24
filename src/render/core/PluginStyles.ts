type PluginStylePayload = {
  id: string
  css?: string
}

export function syncPluginStyles(payloads: PluginStylePayload[]) {
  const active = new Set(payloads.map((payload) => payload.id))
  for (const style of Array.from(
    document.querySelectorAll<HTMLStyleElement>('style[data-flyenv-plugin]')
  )) {
    if (!active.has(style.dataset.flyenvPlugin ?? '')) style.remove()
  }
  for (const payload of payloads) {
    const existing = document.querySelector<HTMLStyleElement>(
      `style[data-flyenv-plugin="${payload.id}"]`
    )
    if (!payload.css) {
      existing?.remove()
      continue
    }
    const style = existing ?? document.createElement('style')
    style.dataset.flyenvPlugin = payload.id
    if (style.textContent !== payload.css) style.textContent = payload.css
    // Host utilities include responsive variants that must follow a plugin's
    // duplicate base utilities (for example grid-cols-1 on Startup Groups).
    if (!existing) document.head.prepend(style)
  }
}
