import { parseGroupChatResponse } from './src/services/ResponseParser.ts';

const xml = `<output>
<group-action type="rename" actor="雪拉比" value="✨ 星光與森林的小窩 ✨"/>

<msg name="雪拉比">大家晚上好呀～ ˇ看著窗外局部多雲的天氣，感覺風涼涼的挺舒服ˇ</msg>

<msg name="基拉奇">晚上好！ (・∀・) ˇ剛吃完宵夜，摸著肚子滿足中ˇ</msg>

<msg name="雪拉比">@Uluot 小烏，今天感覺怎麼樣？有沒有好好休息？</msg>

<msg name="基拉奇">對啊，如果有哪裡不舒服，或者只是想找人聊天，隨時都在喔！ ˇ雖然我們不能讀心，但我們會一直陪著你的ˇ</msg>

<msg name="雪拉比" type="sticker" meaning="摸摸小貓"/>
</output>`;

console.log(JSON.stringify(parseGroupChatResponse(xml), null, 2));
