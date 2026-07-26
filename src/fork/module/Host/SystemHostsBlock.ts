const managedBlockPattern = /(#X-HOSTS-BEGIN#)([\s\S]*?)(#X-HOSTS-END#)/g

export const reconcileSystemHostsBlock = (content: string, desiredBlock: string) => {
  const blocks = content.match(managedBlockPattern) ?? []
  if (!desiredBlock && blocks.length === 0) {
    return { content, changed: false }
  }
  if (desiredBlock && blocks.length === 1 && blocks[0] === desiredBlock) {
    return { content, changed: false }
  }

  const withoutManagedBlocks = content.replace(managedBlockPattern, '')
  const separator =
    desiredBlock && withoutManagedBlocks.length > 0 && !withoutManagedBlocks.endsWith('\n')
      ? '\n'
      : ''
  const nextContent = desiredBlock
    ? `${withoutManagedBlocks}${separator}${desiredBlock}`
    : withoutManagedBlocks

  return { content: nextContent, changed: nextContent !== content }
}
