export type NumberInputResult =
  | { ok: true; numbers: number[] }
  | { ok: false; error: string };

/**
 * 解析「報數字」輸入
 * 支援：1,5,7／1 5 7／1，5、7／範圍 1-3、4~6
 */
export function parseNumberInput(
  input: string,
  opts: { count: number; max: number },
): NumberInputResult {
  const trimmed = input.trim();
  if (!trimmed) {
    return { ok: false, error: `請輸入 ${opts.count} 個數字（例如：1,5,7）` };
  }

  const numbers: number[] = [];
  for (const part of trimmed.split(/[,，、\s]+/).filter(Boolean)) {
    const range = part.match(/^(\d+)[-~～](\d+)$/);
    if (range) {
      const start = Number(range[1]);
      const end = Number(range[2]);
      if (start <= end) {
        for (let n = start; n <= end; n++) numbers.push(n);
        continue;
      }
    } else if (/^\d+$/.test(part)) {
      numbers.push(Number(part));
      continue;
    }
    return { ok: false, error: `看不懂「${part}」，請用數字、逗號或空白分隔` };
  }

  const outOfRange = numbers.filter((n) => n < 1 || n > opts.max);
  if (outOfRange.length > 0) {
    return {
      ok: false,
      error: `數字必須在 1～${opts.max} 之間：${outOfRange.join("、")}`,
    };
  }

  const seen = new Set<number>();
  for (const n of numbers) {
    if (seen.has(n)) return { ok: false, error: `數字重複了：${n}` };
    seen.add(n);
  }

  if (numbers.length !== opts.count) {
    return {
      ok: false,
      error: `這個牌陣需要 ${opts.count} 個數字，你輸入了 ${numbers.length} 個`,
    };
  }

  return { ok: true, numbers };
}
