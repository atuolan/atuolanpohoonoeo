/**
 * 去他房間時的標籤：<room-leave/> 離開房間
 */
export const ROOM_LEAVE_REGEX = /<room-leave(?:\s[^>]*)?\s*(?:\/>|>\s*<\/room-leave>|>)/gi;

export function hasRoomLeaveTag(raw: string): boolean {
  return new RegExp(ROOM_LEAVE_REGEX.source, "i").test(raw);
}
