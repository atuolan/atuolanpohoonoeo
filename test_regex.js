const attrs = 'type="rename" actor="雪拉比" value="✨ 星光與森林的小窩 ✨"';
const name = 'value';
const regex = new RegExp(`${name}=["']([^"']+)["']`, "i");
const match = attrs.match(regex);
console.log('Match:', match ? match[1] : 'null');
