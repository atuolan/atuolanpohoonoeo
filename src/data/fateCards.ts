/**
 * 塔羅牌完整牌組數據（78 張）
 * 22 張大阿卡納 + 56 張小阿卡納
 */
import type { FateCard, FateSuit } from '@/types/fate'

// ============================================================
// 大阿卡納（Major Arcana）— 22 張
// ============================================================

const majorArcana: FateCard[] = [
  {
    id: 'major-00', name: 'The Fool', nameCn: '愚者', type: 'major', number: 0, image: '/cards/major/00-fool.jpg',
    keywords: { upright: ['新開始', '冒險', '純真', '自由', '潛能'], reversed: ['魯莽', '冒失', '愚蠢', '停滯', '恐懼'] },
    meaning: { upright: '代表新的開始、冒險精神和無限可能。暗示你正處於人生旅程的起點，充滿希望和潛力。', reversed: '警示魯莽行事或過於天真。可能暗示恐懼阻礙了你前進的腳步。' },
  },
  {
    id: 'major-01', name: 'The Magician', nameCn: '魔術師', type: 'major', number: 1, image: '/cards/major/01-magician.jpg',
    keywords: { upright: ['創造力', '意志力', '技能', '專注', '行動'], reversed: ['欺騙', '操縱', '才能浪費', '缺乏方向'] },
    meaning: { upright: '象徵你擁有實現目標所需的一切資源和能力。是時候將想法付諸行動了。', reversed: '可能暗示才能被浪費或被人欺騙。需要審視自己的動機和方向。' },
  },
  {
    id: 'major-02', name: 'The High Priestess', nameCn: '女祭司', type: 'major', number: 2, image: '/cards/major/02-high-priestess.jpg',
    keywords: { upright: ['直覺', '神秘', '內在智慧', '潛意識', '靈性'], reversed: ['秘密', '隱藏', '忽視直覺', '表面'] },
    meaning: { upright: '提醒你傾聽內心的聲音，相信直覺。答案可能隱藏在潛意識深處。', reversed: '可能忽視了重要的直覺信號，或有秘密尚未揭露。' },
  },
  {
    id: 'major-03', name: 'The Empress', nameCn: '女皇', type: 'major', number: 3, image: '/cards/major/03-empress.jpg',
    keywords: { upright: ['豐饒', '母性', '自然', '創造', '美麗'], reversed: ['依賴', '空虛', '創造力受阻', '忽視自我'] },
    meaning: { upright: '代表豐盛、創造力和滋養。可能暗示懷孕、新項目誕生或物質豐裕。', reversed: '可能感到創造力枯竭或過度依賴他人。需要重新連接自然和內在力量。' },
  },
  {
    id: 'major-04', name: 'The Emperor', nameCn: '皇帝', type: 'major', number: 4, image: '/cards/major/04-emperor.jpg',
    keywords: { upright: ['權威', '結構', '控制', '父性', '穩定'], reversed: ['專制', '僵化', '缺乏紀律', '濫用權力'] },
    meaning: { upright: '象徵權威、秩序和穩定。暗示需要建立結構或尋求有經驗者的指導。', reversed: '可能暗示過度控制或缺乏紀律。需要在權威和靈活性之間找到平衡。' },
  },
  {
    id: 'major-05', name: 'The Hierophant', nameCn: '教皇', type: 'major', number: 5, image: '/cards/major/05-hierophant.jpg',
    keywords: { upright: ['傳統', '信仰', '教育', '指導', '儀式'], reversed: ['叛逆', '非傳統', '挑戰權威', '個人信念'] },
    meaning: { upright: '代表傳統智慧、精神指導和正規教育。可能暗示尋求導師或遵循傳統。', reversed: '可能在挑戰傳統或尋找自己的精神道路。鼓勵獨立思考。' },
  },
  {
    id: 'major-06', name: 'The Lovers', nameCn: '戀人', type: 'major', number: 6, image: '/cards/major/06-lovers.jpg',
    keywords: { upright: ['愛情', '和諧', '選擇', '價值觀', '結合'], reversed: ['失衡', '價值衝突', '不和諧', '錯誤選擇'] },
    meaning: { upright: '象徵愛情、和諧關係和重要選擇。可能面臨需要遵從內心的決定。', reversed: '可能暗示關係不和諧或價值觀衝突。需要重新審視自己的選擇。' },
  },
  {
    id: 'major-07', name: 'The Chariot', nameCn: '戰車', type: 'major', number: 7, image: '/cards/major/07-chariot.jpg',
    keywords: { upright: ['勝利', '意志力', '決心', '控制', '前進'], reversed: ['失控', '缺乏方向', '侵略性', '障礙'] },
    meaning: { upright: '代表通過意志力和決心獲得勝利。暗示你有能力克服障礙，向目標前進。', reversed: '可能感到失去控制或方向不明。需要重新聚焦並掌控局面。' },
  },
  {
    id: 'major-08', name: 'Strength', nameCn: '力量', type: 'major', number: 8, image: '/cards/major/08-strength.jpg',
    keywords: { upright: ['勇氣', '耐心', '內在力量', '溫柔', '自信'], reversed: ['自我懷疑', '軟弱', '缺乏自信', '粗暴'] },
    meaning: { upright: '象徵內在力量、勇氣和溫柔的堅持。提醒你真正的力量來自內心。', reversed: '可能正在經歷自我懷疑或感到軟弱。需要重新連接內在力量。' },
  },
  {
    id: 'major-09', name: 'The Hermit', nameCn: '隱士', type: 'major', number: 9, image: '/cards/major/09-hermit.jpg',
    keywords: { upright: ['內省', '獨處', '智慧', '尋求真理', '指引'], reversed: ['孤立', '孤獨', '退縮', '拒絕幫助'] },
    meaning: { upright: '代表內省、獨處和尋求內在智慧的時期。是時候暫時退出喧囂，尋找答案。', reversed: '可能過度孤立或拒絕他人的幫助。需要在獨處和社交之間找到平衡。' },
  },
  {
    id: 'major-10', name: 'Wheel of Fortune', nameCn: '命運之輪', type: 'major', number: 10, image: '/cards/major/10-wheel-of-fortune.jpg',
    keywords: { upright: ['命運', '轉變', '週期', '好運', '機遇'], reversed: ['厄運', '抗拒改變', '失控', '逆境'] },
    meaning: { upright: '象徵命運的轉變和生命的週期性。好運即將到來，把握機遇。', reversed: '可能正經歷逆境或抗拒必要的改變。記住這只是暫時的週期。' },
  },
  {
    id: 'major-11', name: 'Justice', nameCn: '正義', type: 'major', number: 11, image: '/cards/major/11-justice.jpg',
    keywords: { upright: ['公正', '真相', '因果', '法律', '平衡'], reversed: ['不公', '逃避責任', '偏見', '欺騙'] },
    meaning: { upright: '代表公正、真相和因果報應。提醒你為自己的行為負責，追求公平。', reversed: '可能暗示不公正的情況或逃避責任。需要誠實面對真相。' },
  },
  {
    id: 'major-12', name: 'The Hanged Man', nameCn: '倒吊人', type: 'major', number: 12, image: '/cards/major/12-hanged-man.jpg',
    keywords: { upright: ['犧牲', '放手', '新視角', '等待', '順從'], reversed: ['拖延', '抗拒', '無謂犧牲', '停滯'] },
    meaning: { upright: '象徵暫停、犧牲和從新角度看問題。有時放手才能獲得更多。', reversed: '可能在無謂地拖延或做出不必要的犧牲。需要重新評估處境。' },
  },
  {
    id: 'major-13', name: 'Death', nameCn: '死神', type: 'major', number: 13, image: '/cards/major/13-death.jpg',
    keywords: { upright: ['結束', '轉變', '過渡', '放下', '重生'], reversed: ['抗拒改變', '停滯', '恐懼', '無法放手'] },
    meaning: { upright: '代表結束和新開始，是轉變而非字面死亡。舊的必須結束，新的才能開始。', reversed: '可能在抗拒必要的改變或無法放下過去。需要接受轉變。' },
  },
  {
    id: 'major-14', name: 'Temperance', nameCn: '節制', type: 'major', number: 14, image: '/cards/major/14-temperance.jpg',
    keywords: { upright: ['平衡', '耐心', '調和', '適度', '目標'], reversed: ['失衡', '過度', '缺乏耐心', '衝突'] },
    meaning: { upright: '象徵平衡、耐心和調和。提醒你在生活各方面保持適度和和諧。', reversed: '可能生活失衡或缺乏耐心。需要重新找到中庸之道。' },
  },
  {
    id: 'major-15', name: 'The Devil', nameCn: '惡魔', type: 'major', number: 15, image: '/cards/major/15-devil.jpg',
    keywords: { upright: ['束縛', '慾望', '物質主義', '陰暗面', '依賴'], reversed: ['解脫', '釋放', '面對陰暗', '打破束縛'] },
    meaning: { upright: '代表束縛、慾望和陰暗面。可能被物質或不健康的關係所困。', reversed: '暗示正在打破束縛或面對內心陰暗面。解脫即將到來。' },
  },
  {
    id: 'major-16', name: 'The Tower', nameCn: '高塔', type: 'major', number: 16, image: '/cards/major/16-tower.jpg',
    keywords: { upright: ['劇變', '崩塌', '啟示', '覺醒', '解放'], reversed: ['逃避災難', '恐懼改變', '延遲崩塌'] },
    meaning: { upright: '象徵突然的劇變和舊結構的崩塌。雖然痛苦，但為重建鋪平道路。', reversed: '可能在逃避必要的改變或災難只是被延遲。需要面對現實。' },
  },
  {
    id: 'major-17', name: 'The Star', nameCn: '星星', type: 'major', number: 17, image: '/cards/major/17-star.jpg',
    keywords: { upright: ['希望', '靈感', '寧靜', '更新', '信心'], reversed: ['絕望', '失去信心', '斷開連接', '悲觀'] },
    meaning: { upright: '代表希望、靈感和內心的寧靜。經歷風暴後，平靜和治癒即將到來。', reversed: '可能感到絕望或失去信心。需要重新連接希望和靈感。' },
  },
  {
    id: 'major-18', name: 'The Moon', nameCn: '月亮', type: 'major', number: 18, image: '/cards/major/18-moon.jpg',
    keywords: { upright: ['幻覺', '恐懼', '潛意識', '直覺', '不確定'], reversed: ['釋放恐懼', '真相揭露', '困惑消除'] },
    meaning: { upright: '象徵幻覺、恐懼和潛意識。事情可能不如表面所見，需要信任直覺。', reversed: '恐懼正在消散，真相即將揭露。困惑的時期即將結束。' },
  },
  {
    id: 'major-19', name: 'The Sun', nameCn: '太陽', type: 'major', number: 19, image: '/cards/major/19-sun.jpg',
    keywords: { upright: ['快樂', '成功', '活力', '樂觀', '真相'], reversed: ['暫時挫折', '過度樂觀', '延遲成功'] },
    meaning: { upright: '代表快樂、成功和積極能量。是最吉祥的牌之一，預示美好時光。', reversed: '成功可能暫時延遲，但仍會到來。保持樂觀但要現實。' },
  },
  {
    id: 'major-20', name: 'Judgement', nameCn: '審判', type: 'major', number: 20, image: '/cards/major/20-judgement.jpg',
    keywords: { upright: ['覺醒', '重生', '召喚', '反思', '赦免'], reversed: ['自我懷疑', '拒絕召喚', '無法原諒'] },
    meaning: { upright: '象徵覺醒、重生和響應更高召喚。是時候反思過去，迎接新生。', reversed: '可能在忽視內心的召喚或無法原諒自己/他人。需要放下過去。' },
  },
  {
    id: 'major-21', name: 'The World', nameCn: '世界', type: 'major', number: 21, image: '/cards/major/21-world.jpg',
    keywords: { upright: ['完成', '整合', '成就', '旅程終點', '圓滿'], reversed: ['未完成', '缺乏結束', '延遲', '空虛'] },
    meaning: { upright: '代表完成、成就和一個週期的圓滿結束。你已經完成了重要的人生旅程。', reversed: '可能有未完成的事務或感到缺乏成就感。需要完成當前週期。' },
  },
]

// ============================================================
// 小阿卡納生成函數
// ============================================================

function createMinorArcana(suit: FateSuit, suitNameCn: string): FateCard[] {
  const suitThemes: Record<FateSuit, string> = {
    wands: '行動、創造、激情',
    cups: '情感、關係、直覺',
    swords: '思想、衝突、真相',
    pentacles: '物質、工作、實際',
  }

  const courtCards = [
    { num: 11, name: 'Page', nameCn: '侍從' },
    { num: 12, name: 'Knight', nameCn: '騎士' },
    { num: 13, name: 'Queen', nameCn: '王后' },
    { num: 14, name: 'King', nameCn: '國王' },
  ]

  const numberMeanings: Record<number, { upright: string[]; reversed: string[] }> = {
    1:  { upright: ['新開始', '潛力', '機遇'], reversed: ['延遲', '錯失機會', '缺乏動力'] },
    2:  { upright: ['平衡', '選擇', '合作'], reversed: ['失衡', '猶豫', '衝突'] },
    3:  { upright: ['成長', '創造', '表達'], reversed: ['缺乏成長', '創意受阻', '分散'] },
    4:  { upright: ['穩定', '基礎', '休息'], reversed: ['不穩定', '停滯', '不安'] },
    5:  { upright: ['挑戰', '衝突', '變化'], reversed: ['恢復', '和解', '接受'] },
    6:  { upright: ['和諧', '給予', '勝利'], reversed: ['不和諧', '自私', '失敗'] },
    7:  { upright: ['反思', '評估', '耐心'], reversed: ['缺乏遠見', '急躁', '困惑'] },
    8:  { upright: ['行動', '速度', '進展'], reversed: ['延遲', '受阻', '混亂'] },
    9:  { upright: ['完成', '滿足', '智慧'], reversed: ['未完成', '不滿', '擔憂'] },
    10: { upright: ['圓滿', '結束', '傳承'], reversed: ['負擔', '抗拒結束', '失敗'] },
    11: { upright: ['好奇', '學習', '消息'], reversed: ['不成熟', '缺乏方向', '壞消息'] },
    12: { upright: ['行動', '冒險', '追求'], reversed: ['魯莽', '停滯', '挫折'] },
    13: { upright: ['滋養', '直覺', '關懷'], reversed: ['情緒化', '依賴', '不安全'] },
    14: { upright: ['領導', '權威', '成熟'], reversed: ['專制', '軟弱', '操控'] },
  }

  const theme = suitThemes[suit]
  const cards: FateCard[] = []
  const suitCap = suit.charAt(0).toUpperCase() + suit.slice(1)

  for (let i = 1; i <= 14; i++) {
    const court = courtCards.find(c => c.num === i)
    let name: string
    let nameCn: string

    if (i === 1) {
      name = `Ace of ${suitCap}`
      nameCn = `${suitNameCn}王牌`
    } else if (court) {
      name = `${court.name} of ${suitCap}`
      nameCn = `${suitNameCn}${court.nameCn}`
    } else {
      name = `${i} of ${suitCap}`
      nameCn = `${suitNameCn}${i}`
    }

    cards.push({
      id: `${suit}-${i.toString().padStart(2, '0')}`,
      name,
      nameCn,
      type: 'minor',
      suit,
      number: i,
      image: `/cards/minor/${suit}/${i.toString().padStart(2, '0')}.jpg`,
      keywords: numberMeanings[i],
      meaning: {
        upright: `在${theme}領域，${numberMeanings[i].upright.join('、')}。`,
        reversed: `在${theme}領域，${numberMeanings[i].reversed.join('、')}。`,
      },
    })
  }

  return cards
}

// ============================================================
// 導出完整 78 張牌
// ============================================================

const wands = createMinorArcana('wands', '權杖')
const cups = createMinorArcana('cups', '聖杯')
const swords = createMinorArcana('swords', '寶劍')
const pentacles = createMinorArcana('pentacles', '星幣')

export const allFateCards: FateCard[] = [
  ...majorArcana,
  ...wands,
  ...cups,
  ...swords,
  ...pentacles,
]

/** 按花色取牌 */
export function getFateCardsBySuit(suit: FateSuit): FateCard[] {
  return allFateCards.filter(c => c.suit === suit)
}

/** 取大阿卡納 */
export function getMajorArcana(): FateCard[] {
  return majorArcana
}
