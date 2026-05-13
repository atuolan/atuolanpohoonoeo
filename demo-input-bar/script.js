(function () {
  const indicator = document.getElementById('indicator');
  const track = indicator.parentElement;
  const inputBar = document.querySelector('.input-bar');
  const buttons = Array.from(document.querySelectorAll('.icon-btn'));
  const messageInput = document.querySelector('.message-input');
  const messageArea = document.querySelector('.message-area');

  // current target: either an HTMLElement (button) or 'full' / 'message'
  let currentTarget = 'full';

  function rectRelativeTo(el, parent) {
    const a = el.getBoundingClientRect();
    const b = parent.getBoundingClientRect();
    return { left: a.left - b.left, width: a.width };
  }

  function moveTo(target, colorClass) {
    let left, width;
    if (target === 'full') {
      left = 0;
      width = track.clientWidth;
    } else {
      const r = rectRelativeTo(target, track);
      left = r.left;
      width = r.width;
    }
    indicator.style.left = left + 'px';
    indicator.style.width = width + 'px';

    indicator.className = 'underline-indicator';
    if (colorClass) indicator.classList.add(colorClass);
  }

  function clearActive() {
    buttons.forEach(b => b.classList.remove('active'));
  }

  function activateButton(btn) {
    clearActive();
    btn.classList.add('active');
    currentTarget = btn;
    const icon = btn.dataset.icon;
    track.classList.add('dimmed');
    moveTo(btn, 'color-' + icon);
  }

  function activateMessage() {
    clearActive();
    currentTarget = 'message';
    inputBar.classList.add('message-focus');
    track.classList.add('dimmed');
    // 等右側 refresh 收合動畫進行中重新計算位置
    requestAnimationFrame(() => moveTo(messageArea, 'color-message'));
    setTimeout(() => {
      if (currentTarget === 'message') moveTo(messageArea, 'color-message');
    }, 320);
  }

  function activateFull() {
    clearActive();
    currentTarget = 'full';
    inputBar.classList.remove('message-focus');
    track.classList.remove('dimmed');
    moveTo('full', 'color-message');
  }

  buttons.forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      // send 按鈕：不觸發聚焦/底線變化，維持預設顏色
      if (btn.dataset.icon === 'send') {
        return;
      }
      // toggle: clicking the same active button returns to full underline
      if (btn.classList.contains('active')) {
        activateFull();
      } else {
        activateButton(btn);
      }
    });
  });

  messageInput.addEventListener('focus', activateMessage);
  messageInput.addEventListener('click', (e) => {
    e.stopPropagation();
    activateMessage();
  });

  // click anywhere else on the input bar -> reset to full line
  inputBar.addEventListener('click', () => {
    activateFull();
  });

  // initial position after layout
  window.addEventListener('load', () => {
    activateFull();
  });

  window.addEventListener('resize', () => {
    if (currentTarget === 'full') {
      moveTo('full', 'color-message');
    } else if (currentTarget === 'message') {
      moveTo(messageArea, 'color-message');
    } else if (currentTarget instanceof HTMLElement) {
      moveTo(currentTarget, 'color-' + currentTarget.dataset.icon);
    }
  });
})();
