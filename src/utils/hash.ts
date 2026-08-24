/** FNV-1a 32 位哈希：给类别名生成稳定的调色板下标。 */

export function fnv1a32(input: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  // 转无符号
  return hash >>> 0;
}
