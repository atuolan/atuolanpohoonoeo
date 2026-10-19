/**
 * Discord 授權導回：網頁版照舊 302，Android App 回中繼頁（自動跳回＋按鈕）。
 */
import { describe, expect, it } from 'vitest';
import { redirectBack } from './discord-oauth.js';

describe('redirectBack', () => {
  it('網頁版直接 302', () => {
    const res = redirectBack('https://203aguaphone.aguacloud.uk/discord-callback.html?discord_user_id=1');
    expect(res.status).toBe(302);
    expect(res.headers.get('Location')).toBe(
      'https://203aguaphone.aguacloud.uk/discord-callback.html?discord_user_id=1',
    );
  });

  it('App 回中繼頁，按鈕和自動跳轉都指向 App 的專屬連結', async () => {
    const target =
      'uk.aguacloud.aguaphone://oauth/auth/discord-callback.html?discord_user_id=1&auth_result=%7B%22a%22%3A1%7D';
    const res = redirectBack(target);
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toContain('text/html');
    const html = await res.text();
    expect(html).toContain(`href="${target.replace(/&/g, '&amp;')}"`);
    expect(html).toContain(`location.replace(${JSON.stringify(target)})`);
  });

  it('參數裡的 </script> 不會跑出 script 標籤', async () => {
    const target = 'uk.aguacloud.aguaphone://oauth/auth?discord_error=</script><b>x';
    const html = await redirectBack(target).text();
    expect(html).not.toContain('</script><b>');
    expect(html).toContain('&lt;/script&gt;&lt;b&gt;x');
  });
});
