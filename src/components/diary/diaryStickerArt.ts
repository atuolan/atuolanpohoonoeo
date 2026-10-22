import type { DiaryStickerId } from "@/utils/diaryStyle";

export interface DiaryStickerArt {
  viewBox: string;
  body: string;
  dieCut: boolean;
}

export const DIARY_STICKER_ART: Record<DiaryStickerId, DiaryStickerArt> = {
  star: {
    viewBox: "-1 -1 26 26",
    dieCut: true,
    body:
      `<defs><linearGradient id="__ID__-g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffe38f"></stop><stop offset="1" stop-color="#f3b21f"></stop></linearGradient></defs><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01z" fill="url(#__ID__-g)" stroke-linejoin="round"></path><ellipse cx="10" cy="9" rx="2.2" ry="1.1" fill="#fff" opacity="0.6" transform="rotate(-30 10 9)"></ellipse>`,
  },
  heart: {
    viewBox: "-1 -1 26 26",
    dieCut: true,
    body:
      `<defs><linearGradient id="__ID__-g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffb8c9"></stop><stop offset="1" stop-color="#ff5f86"></stop></linearGradient></defs><path d="M12 21s-7-4.4-9.5-8.6C.6 9.1 2.4 5 6.2 5c2.2 0 3.6 1.3 5.8 3.4C14.2 6.3 15.6 5 17.8 5c3.8 0 5.6 4.1 3.7 7.4C19 16.6 12 21 12 21z" fill="url(#__ID__-g)"></path><ellipse cx="7" cy="8.6" rx="2" ry="1.1" fill="#fff" opacity="0.65" transform="rotate(-35 7 8.6)"></ellipse>`,
  },
  moon: {
    viewBox: "-1 -1 26 26",
    dieCut: true,
    body:
      `<defs><linearGradient id="__ID__-g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ece8ff"></stop><stop offset="1" stop-color="#9d8cec"></stop></linearGradient></defs><path d="M20 14.5A8.5 8.5 0 1 1 9.5 4a7 7 0 0 0 10.5 10.5z" fill="url(#__ID__-g)"></path><circle cx="10" cy="13" r="1" fill="#7b6cc9" opacity="0.35"></circle><circle cx="13" cy="17" r="1.4" fill="#7b6cc9" opacity="0.3"></circle><path d="M18.5 4.5l.5 1.3 1.3.5-1.3.5-.5 1.3-.5-1.3-1.3-.5 1.3-.5z" fill="#ffd166"></path>`,
  },
  cloud: {
    viewBox: "-1 -1 26 26",
    dieCut: true,
    body:
      `<defs><linearGradient id="__ID__-g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffffff"></stop><stop offset="1" stop-color="#cfe0f2"></stop></linearGradient></defs><path d="M6.5 19h11a4.5 4.5 0 0 0 .6-8.96A6.5 6.5 0 0 0 5.6 9.3 4.9 4.9 0 0 0 6.5 19z" fill="url(#__ID__-g)" stroke="#b8cde3" stroke-width="0.6"></path><circle cx="10" cy="14" r="0.9" fill="#4d5d70"></circle><circle cx="14.4" cy="14" r="0.9" fill="#4d5d70"></circle><ellipse cx="8.4" cy="15.8" rx="1.2" ry="0.7" fill="#ffb3c6" opacity="0.8"></ellipse><ellipse cx="16" cy="15.8" rx="1.2" ry="0.7" fill="#ffb3c6" opacity="0.8"></ellipse>`,
  },
  raindrop: {
    viewBox: "-1 -1 26 26",
    dieCut: true,
    body:
      `<defs><linearGradient id="__ID__-g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#d4ecff"></stop><stop offset="1" stop-color="#4f9be0"></stop></linearGradient></defs><path d="M12 2.5s6.5 7.4 6.5 11.7a6.5 6.5 0 0 1-13 0C5.5 9.9 12 2.5 12 2.5z" fill="url(#__ID__-g)"></path><path d="M9 13.5a3.5 3.5 0 0 0 1.4 3.6" fill="none" stroke="#fff" stroke-width="1.4" stroke-linecap="round" opacity="0.8"></path>`,
  },
  flower: {
    viewBox: "-1 -1 26 26",
    dieCut: true,
    body:
      `<defs><radialGradient id="__ID__-g" cx="0.5" cy="0.5" r="0.6"><stop offset="0" stop-color="#ffe4ec"></stop><stop offset="1" stop-color="#ff9fbb"></stop></radialGradient></defs><circle cx="12" cy="6.5" r="3.6" fill="url(#__ID__-g)"></circle><circle cx="17.3" cy="10.4" r="3.6" fill="url(#__ID__-g)"></circle><circle cx="15.3" cy="16.6" r="3.6" fill="url(#__ID__-g)"></circle><circle cx="8.7" cy="16.6" r="3.6" fill="url(#__ID__-g)"></circle><circle cx="6.7" cy="10.4" r="3.6" fill="url(#__ID__-g)"></circle><circle cx="12" cy="12" r="2.8" fill="#ffd166" stroke="#e8a900" stroke-width="0.6"></circle>`,
  },
  coffee: {
    viewBox: "-1 -1 26 26",
    dieCut: true,
    body:
      `<defs><linearGradient id="__ID__-g" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#fff8ee"></stop><stop offset="1" stop-color="#e9d6bd"></stop></linearGradient></defs><path d="M17 11h1.3a2.7 2.7 0 0 1 0 5.4H16.5" fill="none" stroke="#c8a983" stroke-width="1.6"></path><path d="M4.5 9.5h13v5.5a5 5 0 0 1-5 5h-3a5 5 0 0 1-5-5z" fill="url(#__ID__-g)" stroke="#c8a983" stroke-width="0.8"></path><ellipse cx="11" cy="9.6" rx="6.4" ry="1.1" fill="#7a4e2c"></ellipse><path d="M9 3c-1 1.5 1 2 0 4.2M13 3c-1 1.5 1 2 0 4.2" fill="none" stroke="#b9a48c" stroke-width="1.1" stroke-linecap="round"></path><path d="M11 17.3s-2-1.2-2-2.4c0-.7.6-1.1 1.1-1.1.4 0 .7.2.9.6.2-.4.5-.6.9-.6.5 0 1.1.4 1.1 1.1 0 1.2-2 2.4-2 2.4z" fill="#ff8fab"></path>`,
  },
  cat: {
    viewBox: "-1 -1 26 26",
    dieCut: true,
    body:
      `<defs><linearGradient id="__ID__-g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffd9a8"></stop><stop offset="1" stop-color="#f0a35a"></stop></linearGradient></defs><path d="M4.5 20.5V9L7 3.5l3.4 4.3h3.2L17 3.5 19.5 9v11.5z" fill="url(#__ID__-g)" stroke-linejoin="round"></path><path d="M6.4 6.3L7 5l1.3 1.7zM17.6 6.3L17 5l-1.3 1.7z" fill="#ffb8c9"></path><path d="M9 11.5l1.8 .3M15 11.5l-1.8 .3" stroke="#c46f2a" stroke-width="0.9" stroke-linecap="round"></path><circle cx="9.5" cy="13.4" r="1.05" fill="#3b2a1a"></circle><circle cx="14.5" cy="13.4" r="1.05" fill="#3b2a1a"></circle><path d="M11.3 15.4h1.4l-.7.8z" fill="#e66b8a"></path><path d="M12 16.2q-.6 1-1.6.6M12 16.2q.6 1 1.6.6" fill="none" stroke="#3b2a1a" stroke-width="0.7" stroke-linecap="round"></path><path d="M7.5 15.6l-3 .4M7.5 16.6l-2.8 1.2M16.5 15.6l3 .4M16.5 16.6l2.8 1.2" stroke="#8a5a30" stroke-width="0.5" stroke-linecap="round"></path>`,
  },
  sun: {
    viewBox: "-1 -1 26 26",
    dieCut: true,
    body:
      `<defs><radialGradient id="__ID__-g" cx="0.4" cy="0.35" r="0.7"><stop offset="0" stop-color="#fff1b0"></stop><stop offset="1" stop-color="#ffb21f"></stop></radialGradient></defs><path d="M12 1.5l1.6 3.2 3.4-1.1-.3 3.5 3.5.5-1.9 3 2.6 2.4-3.3 1.3.9 3.4-3.5-.4-1 3.4L12 18.4l-2.4 2.3-1-3.4-3.5.4.9-3.4-3.3-1.3 2.6-2.4-1.9-3 3.5-.5-.3-3.5 3.4 1.1z" fill="#ffc94a"></path><circle cx="12" cy="11.5" r="5.2" fill="url(#__ID__-g)"></circle><ellipse cx="10.3" cy="9.6" rx="1.6" ry="0.9" fill="#fff" opacity="0.7" transform="rotate(-30 10.3 9.6)"></ellipse>`,
  },
  paperclip: {
    viewBox: "0 0 24 56",
    dieCut: false,
    body:
      `<defs><linearGradient id="__ID__-g" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#eef1f5"></stop><stop offset="0.5" stop-color="#9aa2ad"></stop><stop offset="1" stop-color="#dfe3e8"></stop></linearGradient></defs><path d="M8 20V8a4 4 0 0 1 8 0v34a6 6 0 0 1-12 0V14" fill="none" stroke="url(#__ID__-g)" stroke-width="2.6" stroke-linecap="round"></path>`,
  },
  strawberry: {
    viewBox: "-1 -1 26 26",
    dieCut: true,
    body:
      `<defs><linearGradient id="__ID__-g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ff8a94"></stop><stop offset="1" stop-color="#d92e47"></stop></linearGradient></defs><path d="M12 21.5c-4.6-2-7.3-6.2-7.3-9.8 0-3.3 3.1-4.9 7.3-4.9s7.3 1.6 7.3 4.9c0 3.6-2.7 7.8-7.3 9.8z" fill="url(#__ID__-g)"></path><g fill="#ffe08a"><ellipse cx="9" cy="10.5" rx="0.45" ry="0.7"></ellipse><ellipse cx="12" cy="10" rx="0.45" ry="0.7"></ellipse><ellipse cx="15" cy="10.5" rx="0.45" ry="0.7"></ellipse><ellipse cx="10.5" cy="13.5" rx="0.45" ry="0.7"></ellipse><ellipse cx="13.5" cy="13.5" rx="0.45" ry="0.7"></ellipse><ellipse cx="12" cy="16.6" rx="0.45" ry="0.7"></ellipse><ellipse cx="9" cy="16" rx="0.45" ry="0.7"></ellipse><ellipse cx="15" cy="16" rx="0.45" ry="0.7"></ellipse></g><path d="M7.5 7.3l2.2-2.6 2.3 1.8 2.3-1.8 2.2 2.6-2.4.6-2.1-.9-2.1.9z" fill="#5cb85c"></path><path d="M12 6.4V3" stroke="#3f8f3f" stroke-width="1.1" stroke-linecap="round"></path><ellipse cx="8.4" cy="11.8" rx="1.1" ry="1.8" fill="#fff" opacity="0.45" transform="rotate(20 8.4 11.8)"></ellipse>`,
  },
  cake: {
    viewBox: "-1 -1 26 26",
    dieCut: true,
    body:
      `<rect x="4" y="11" width="16" height="9" rx="1.6" fill="#f3d19c"></rect><rect x="4" y="15" width="16" height="1.8" fill="#fff4f6"></rect><rect x="4" y="15" width="16" height="0.6" fill="#ff9fb8"></rect><path d="M4 12.6V11a1.6 1.6 0 0 1 1.6-1.6h12.8A1.6 1.6 0 0 1 20 11v1.6c-1.3 1.7-2.7-.6-4 0s-2.7 1.7-4 0-2.7-.6-4 0-2.7 1.7-4 0z" fill="#ffc2d4"></path><circle cx="12" cy="7" r="2.1" fill="#e23b4e"></circle><circle cx="11.3" cy="6.4" r="0.6" fill="#fff" opacity="0.7"></circle><path d="M12.6 5.2c.4-1.4 1.5-2.4 3-2.8" fill="none" stroke="#4f9a4f" stroke-width="0.9" stroke-linecap="round"></path>`,
  },
  envelope: {
    viewBox: "-1 -1 26 26",
    dieCut: true,
    body:
      `<defs><linearGradient id="__ID__-g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fffaf0"></stop><stop offset="1" stop-color="#eedfc2"></stop></linearGradient></defs><rect x="2.5" y="6" width="19" height="13" rx="1.8" fill="url(#__ID__-g)" stroke="#d2bd96" stroke-width="0.6"></rect><path d="M3 6.8l9 6.6 9-6.6" fill="none" stroke="#c9b48f" stroke-width="1"></path><path d="M12 15.6s-2.3-1.3-2.3-2.8c0-.8.6-1.3 1.3-1.3.5 0 .8.3 1 .7.2-.4.5-.7 1-.7.7 0 1.3.5 1.3 1.3 0 1.5-2.3 2.8-2.3 2.8z" fill="#d93a52"></path>`,
  },
  note: {
    viewBox: "-1 -1 26 26",
    dieCut: true,
    body:
      `<path d="M9.2 18.5V6.2l10-2.2v12.2" fill="none" stroke="#3d4a6b" stroke-width="1.9" stroke-linejoin="round"></path><path d="M9.2 9l10-2.2" stroke="#3d4a6b" stroke-width="2.6"></path><ellipse cx="6.9" cy="18.6" rx="2.6" ry="2.1" fill="#3d4a6b" transform="rotate(-20 6.9 18.6)"></ellipse><ellipse cx="16.9" cy="16.3" rx="2.6" ry="2.1" fill="#3d4a6b" transform="rotate(-20 16.9 16.3)"></ellipse><ellipse cx="6.1" cy="18" rx="0.9" ry="0.5" fill="#fff" opacity="0.5" transform="rotate(-20 6.1 18)"></ellipse>`,
  },
  rainbow: {
    viewBox: "-1 -1 26 26",
    dieCut: true,
    body:
      `<g fill="none" stroke-width="2" stroke-linecap="round"><path d="M3 17a9 9 0 0 1 18 0" stroke="#ff7a85"></path><path d="M5 17a7 7 0 0 1 14 0" stroke="#ffb347"></path><path d="M7 17a5 5 0 0 1 10 0" stroke="#ffe066"></path><path d="M9 17a3 3 0 0 1 6 0" stroke="#7fd17f"></path></g><g fill="#ffffff" stroke="#d5e2ef" stroke-width="0.5"><circle cx="3.6" cy="18" r="2.1"></circle><circle cx="6" cy="18.6" r="1.7"></circle><circle cx="20.4" cy="18" r="2.1"></circle><circle cx="18" cy="18.6" r="1.7"></circle></g>`,
  },
  clover: {
    viewBox: "-1 -1 26 26",
    dieCut: true,
    body:
      `<defs><radialGradient id="__ID__-g" cx="0.4" cy="0.35" r="0.7"><stop offset="0" stop-color="#a6e3a1"></stop><stop offset="1" stop-color="#3f9c48"></stop></radialGradient></defs><path d="M12 12c1 3 2 6 1.5 9.5" fill="none" stroke="#3f8f3f" stroke-width="1.2" stroke-linecap="round"></path><circle cx="8.8" cy="8.8" r="3.6" fill="url(#__ID__-g)"></circle><circle cx="15.2" cy="8.8" r="3.6" fill="url(#__ID__-g)"></circle><circle cx="8.8" cy="15.2" r="3.6" fill="url(#__ID__-g)"></circle><circle cx="15.2" cy="15.2" r="3.6" fill="url(#__ID__-g)"></circle><path d="M12 5.5v13M5.5 12h13" stroke="#2f7a37" stroke-width="0.6" opacity="0.5"></path>`,
  },
  lightning: {
    viewBox: "-1 -1 26 26",
    dieCut: true,
    body:
      `<defs><linearGradient id="__ID__-g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff07a"></stop><stop offset="1" stop-color="#ff9d1f"></stop></linearGradient></defs><path d="M13.5 1.5L4.5 13.5h6.2L9.5 22.5l10-12.5h-6.6z" fill="url(#__ID__-g)" stroke-linejoin="round"></path><path d="M12.3 4.5L8 10.5" stroke="#fff" stroke-width="1" stroke-linecap="round" opacity="0.7"></path>`,
  },
  bow: {
    viewBox: "-1 -1 26 26",
    dieCut: true,
    body:
      `<defs><linearGradient id="__ID__-g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffb3c6"></stop><stop offset="1" stop-color="#f06292"></stop></linearGradient></defs><path d="M11 13l-3.5 8 2.6-.9 1.4 2z" fill="#e2557f"></path><path d="M13 13l3.5 8-2.6-.9-1.4 2z" fill="#e2557f"></path><path d="M12 12C9 7.6 3.5 6.6 3.5 9.3v5.4C3.5 17.4 9 16.4 12 12z" fill="url(#__ID__-g)"></path><path d="M12 12c3-4.4 8.5-5.4 8.5-2.7v5.4c0 2.7-5.5 1.7-8.5-2.7z" fill="url(#__ID__-g)"></path><rect x="10.3" y="10" width="3.4" height="4" rx="1.4" fill="#e2557f"></rect><ellipse cx="6" cy="9.8" rx="1.4" ry="0.7" fill="#fff" opacity="0.6"></ellipse>`,
  },
  leaf: {
    viewBox: "-1 -1 26 26",
    dieCut: true,
    body:
      `<defs><linearGradient id="__ID__-g" x1="0" y1="1" x2="1" y2="0"><stop offset="0" stop-color="#3f8f4a"></stop><stop offset="1" stop-color="#9edc8a"></stop></linearGradient></defs><path d="M4.5 19.5C4.5 10.5 10.5 4 20 4c0 9.5-6.5 15.5-15.5 15.5z" fill="url(#__ID__-g)"></path><path d="M4.5 19.5L15 9M9 15l-1-3.5M12 12l3 .5" fill="none" stroke="#2f6b37" stroke-width="0.9" stroke-linecap="round" opacity="0.7"></path>`,
  },
  snowflake: {
    viewBox: "-1 -1 26 26",
    dieCut: true,
    body:
      `<g stroke="#7fb8ea" stroke-width="1.8" stroke-linecap="round" fill="none"><path d="M12 2.5v19M3.8 7.25l16.4 9.5M3.8 16.75l16.4-9.5"></path><path d="M9.8 4.3L12 6.3l2.2-2M9.8 19.7L12 17.7l2.2 2M4.8 10.1l2.9-.6-.9-2.8M19.2 13.9l-2.9.6.9 2.8M4.8 13.9l2.9.6-.9 2.8M19.2 10.1l-2.9-.6.9-2.8"></path></g><circle cx="12" cy="12" r="1.6" fill="#b9dcf7"></circle>`,
  },
  bandage: {
    viewBox: "-1 -1 26 26",
    dieCut: true,
    body:
      `<g transform="rotate(-35 12 12)"><rect x="1.5" y="8.3" width="21" height="7.4" rx="3.7" fill="#f2c08f"></rect><rect x="8.5" y="8.9" width="7" height="6.2" rx="1" fill="#f9dcbd"></rect><g fill="#d79e66"><circle cx="4.5" cy="10.8" r="0.4"></circle><circle cx="4.5" cy="13.2" r="0.4"></circle><circle cx="6.2" cy="12" r="0.4"></circle><circle cx="19.5" cy="10.8" r="0.4"></circle><circle cx="19.5" cy="13.2" r="0.4"></circle><circle cx="17.8" cy="12" r="0.4"></circle></g></g>`,
  },
  fire: {
    viewBox: "-1 -1 26 26",
    dieCut: true,
    body:
      `<defs><linearGradient id="__ID__-g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffc15a"></stop><stop offset="1" stop-color="#ff4f2e"></stop></linearGradient></defs><path d="M12 22.5c-4.2 0-6.8-2.9-6.8-6.5 0-3.9 3.2-5.8 3.6-9.6 2.1 1.3 3.1 3.1 3.1 5 1.1-1 1.7-2.7 1.6-4.5 3.1 2.3 5.3 5.4 5.3 9.1 0 3.6-2.6 6.5-6.8 6.5z" fill="url(#__ID__-g)"></path><path d="M12 21.5c-1.9 0-3.2-1.3-3.2-3 0-1.9 1.6-2.8 2.1-4.6 1.6 1 3.2 2.7 3.2 4.6 0 1.7-1 3-2.1 3z" fill="#ffe066"></path>`,
  },
  dog: {
    viewBox: "-1 -1 26 26",
    dieCut: true,
    body:
      `<defs><linearGradient id="__ID__-g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fbe3c2"></stop><stop offset="1" stop-color="#e9bf8a"></stop></linearGradient></defs><ellipse cx="12" cy="13.2" rx="7" ry="6.6" fill="url(#__ID__-g)"></ellipse><path d="M5.6 8C3 8 2.4 13.2 4 15.8c1.6-1.5 2.6-4.6 2.9-6.7z" fill="#a7774a"></path><path d="M18.4 8c2.6 0 3.2 5.2 1.6 7.8-1.6-1.5-2.6-4.6-2.9-6.7z" fill="#a7774a"></path><ellipse cx="12" cy="16.2" rx="3.2" ry="2.4" fill="#fff6ea"></ellipse><circle cx="9.3" cy="12.4" r="1" fill="#3b2a1a"></circle><circle cx="14.7" cy="12.4" r="1" fill="#3b2a1a"></circle><ellipse cx="12" cy="14.8" rx="1.5" ry="1" fill="#3b2a1a"></ellipse><path d="M12 15.8v1M12 16.8q-.9.8-1.7.2M12 16.8q.9.8 1.7.2" fill="none" stroke="#3b2a1a" stroke-width="0.6" stroke-linecap="round"></path><ellipse cx="7.6" cy="15" rx="1.1" ry="0.6" fill="#ffb3c6" opacity="0.8"></ellipse><ellipse cx="16.4" cy="15" rx="1.1" ry="0.6" fill="#ffb3c6" opacity="0.8"></ellipse>`,
  },
  exclaim: {
    viewBox: "-1 -1 26 26",
    dieCut: true,
    body:
      `<path d="M4 4.5h16a2 2 0 0 1 2 2v9.5a2 2 0 0 1-2 2h-8.5l-4.5 3.8V18H4a2 2 0 0 1-2-2V6.5a2 2 0 0 1 2-2z" fill="#ffffff" stroke="#3d4a6b" stroke-width="1.3" stroke-linejoin="round"></path><text x="12" y="14.8" text-anchor="middle" font-size="9" font-weight="800" font-family="system-ui, sans-serif" fill="#e23b4e">!?</text>`,
  },
};
