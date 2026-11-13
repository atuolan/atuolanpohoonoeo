/** 用程式畫的小像素圖（轉盤、轉盤選單的圖示），輸出 SVG data URI */

/** 一行一行把 # 畫成方塊，連在一起的合成一條 */
export function glyphSvg(rows: string[], color: string): string {
  let r = "";
  rows.forEach((row, y) => {
    let x = 0;
    while (x < row.length) {
      if (row[x] === "#") {
        let w = 1;
        while (row[x + w] === "#") w++;
        r += `<rect x="${x}" y="${y}" width="${w}" height="1" fill="${color}"/>`;
        x += w;
      } else x++;
    }
  });
  const size = rows.length;
  return (
    "data:image/svg+xml," +
    encodeURIComponent(
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" shape-rendering="crispEdges">${r}</svg>`,
    )
  );
}

/** 多色的小像素圖：每個字元照 palette 上色，"." 或 palette 沒有的字元是透明。寬高照 rows */
export function pixelSvg(rows: string[], palette: Record<string, string>): string {
  let r = "";
  rows.forEach((row, y) => {
    let x = 0;
    while (x < row.length) {
      const c = palette[row[x]];
      if (c) {
        let w = 1;
        while (row[x + w] === row[x]) w++;
        r += `<rect x="${x}" y="${y}" width="${w}" height="1" fill="${c}"/>`;
        x += w;
      } else x++;
    }
  });
  const w = Math.max(...rows.map((row) => row.length));
  return (
    "data:image/svg+xml," +
    encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${rows.length}" shape-rendering="crispEdges">${r}</svg>`)
  );
}
