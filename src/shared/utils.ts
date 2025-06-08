/**
 * 将数组中的指定项移动到新位置
 * @param {Array} arr - 要操作的数组
 * @param {number} fromIndex - 要移动的项的原始索引
 * @param {number} toIndex - 要移动到的目标索引
 * @returns {Array} 新数组（不改变原数组）
 */
export function ArrayMoveItem(arr: any[], fromIndex: number, toIndex: number) {
  if (fromIndex < 0 || fromIndex >= arr.length || toIndex < 0 || toIndex >= arr.length) {
    return [...arr]
  }

  const newArr = [...arr]
  const [item] = newArr.splice(fromIndex, 1)
  newArr.splice(toIndex, 0, item)
  return newArr
}
