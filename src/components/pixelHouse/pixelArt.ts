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

/** 15×15 的像素轉盤，八片顏色跟選單 App 一樣 */
export function dialSvg(): string {
  const seg = ["#9ED3A5", "#F3D98B", "#F4A9B8", "#9CC7E6", "#F2B8A0", "#C9A7E0", "#F5D46A", "#B7B4EE"];
  let r = "";
  for (let y = 0; y < 15; y++) {
    for (let x = 0; x < 15; x++) {
      const dx = x - 7;
      const dy = y - 7;
      const dist = Math.sqrt(dx * dx + dy * dy);
      let col: string | null = null;
      if (dist > 7.4) col = null;
      else if (dist > 6.3) col = "#3B2A26";
      else if (dist < 1.2) col = "#3B2A26";
      else if (dist < 2.4) col = "#FBF7EE";
      else {
        const ang = (Math.atan2(dy, dx) + Math.PI * 2 + Math.PI / 8) % (Math.PI * 2);
        col = seg[Math.floor(ang / (Math.PI / 4)) % 8];
        if (dist > 5.3 && dx + dy > 2) col = col + "B0";
      }
      if (col) r += `<rect x="${x}" y="${y}" width="1" height="1" fill="${col}"/>`;
    }
  }
  return (
    "data:image/svg+xml," +
    encodeURIComponent(
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 15 15" shape-rendering="crispEdges">${r}</svg>`,
    )
  );
}
