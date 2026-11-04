/**
 * Peer sync WebSocket 訊息總線。
 *
 * App.vue 擁有 WebSocket 連線實體，透過 `setPeerSyncSocket` 提供給這個模組。
 * PeerSyncManager 透過 `sendPeerMessage` 送出 peer:* 訊息，透過 `onPeerMessage`
 * 接收 peer:* 回覆並做 requestId 配對。
 */

import type { PeerMessage } from "@/types/selfHostedSync";

type PeerMessageHandler = (message: PeerMessage) => void;
type PeerDisconnectHandler = () => void;

let socket: WebSocket | null = null;
const handlers = new Set<PeerMessageHandler>();
const disconnectHandlers = new Set<PeerDisconnectHandler>();

export function setPeerSyncSocket(next: WebSocket | null): void {
  const previous = socket;
  socket = next;
  // 舊的 socket 被拿掉或換掉，就通知所有監聽者，讓還在等回應的請求馬上失敗重試。
  // 不能只看舊 socket 是不是 OPEN：onclose 之後才來清的時候它已經是 CLOSED，
  // 以前就因為這樣沒通知，請求只能乾等到逾時。
  if (previous && previous !== next) {
    console.log("[peerSyncSocket] socket 斷線或更換，通知 disconnect handlers");
    for (const handler of disconnectHandlers) {
      try {
        handler();
      } catch (error) {
        console.warn("[peerSyncSocket] disconnect handler threw:", error);
      }
    }
  }
}

export function isPeerSyncSocketOpen(): boolean {
  return !!socket && socket.readyState === WebSocket.OPEN;
}

export function sendPeerMessage(message: PeerMessage): void {
  if (!socket || socket.readyState !== WebSocket.OPEN) {
    throw new Error("Peer sync WebSocket is not connected");
  }
  const anyMsg = message as unknown as Record<string, unknown>;
  console.log("[peerSyncSocket] → send peer message:", {
    type: message.type,
    requestId: (anyMsg.requestId as string) ?? null,
    targetDeviceId: (anyMsg.targetDeviceId as string) ?? null,
    payloadSize: JSON.stringify(message).length,
  });
  socket.send(JSON.stringify(message));
}

export function dispatchPeerMessage(message: PeerMessage): void {
  for (const handler of handlers) {
    try {
      handler(message);
    } catch (error) {
      console.warn("[PeerSyncSocket] handler threw:", error);
    }
  }
}

export function onPeerMessage(handler: PeerMessageHandler): () => void {
  handlers.add(handler);
  return () => {
    handlers.delete(handler);
  };
}

export function onPeerSocketDisconnect(handler: PeerDisconnectHandler): () => void {
  disconnectHandlers.add(handler);
  return () => {
    disconnectHandlers.delete(handler);
  };
}

export function isPeerMessageType(type: unknown): type is PeerMessage["type"] {
  return typeof type === "string" && type.startsWith("peer:");
}
