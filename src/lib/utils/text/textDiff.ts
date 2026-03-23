export type DiffSegment = { text: string; added: boolean }

export function splitWords(text: string): string[] {
  return text.trim().length > 0 ? text.trim().split(/\s+/) : []
}

export function normalizeWord(word: string): string {
  return word.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "")
}

export function buildLcsTable(a: string[], b: string[]): number[][] {
  const table: number[][] = Array.from({ length: a.length + 1 }, () => Array(b.length + 1).fill(0))
  for (let i = 1; i <= a.length; i += 1) {
    for (let j = 1; j <= b.length; j += 1) {
      if (a[i - 1] === b[j - 1]) {
        table[i][j] = table[i - 1][j - 1] + 1
      } else {
        table[i][j] = Math.max(table[i - 1][j], table[i][j - 1])
      }
    }
  }
  return table
}

export function getDiffSegments(baseline: string, current: string): DiffSegment[] {
  const baseWords = splitWords(baseline).map(normalizeWord)
  const currWordsRaw = splitWords(current)
  const currWords = currWordsRaw.map(normalizeWord)
  if (baseWords.length === 0) {
    return currWordsRaw.map((word, idx) => ({
      text: idx === currWordsRaw.length - 1 ? word : `${word} `,
      added: false,
    }))
  }
  const table = buildLcsTable(baseWords, currWords)
  const inLcs = new Set<number>()
  let i = baseWords.length
  let j = currWords.length
  while (i > 0 && j > 0) {
    if (baseWords[i - 1] === currWords[j - 1]) {
      inLcs.add(j - 1)
      i -= 1
      j -= 1
    } else if (table[i - 1][j] >= table[i][j - 1]) {
      i -= 1
    } else {
      j -= 1
    }
  }
  return currWordsRaw.map((word, idx) => ({
    text: idx === currWordsRaw.length - 1 ? word : `${word} `,
    added: !inLcs.has(idx) && currWords[idx].length > 0,
  }))
}
