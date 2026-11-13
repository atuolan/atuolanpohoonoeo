/**
 * 「小屋的事」卡片：使用者在小屋記事裡勾了幾件事，告訴住在小屋的他。
 * 文字在送出時就寫好（使用者的口吻：「你」是他、「我」是使用者），卡片和給 AI 的說明都用同一份。
 */
export interface HouseNewsItem {
  /** 發生的時間 */
  at: number;
  /** 發生了什麼，例如「小咪在臥室地上尿尿了」「你帶豆豆出門散步」 */
  text: string;
}

export interface HouseNewsShare {
  items: HouseNewsItem[];
  sentAt: number;
}
