import { CLOUDBASE_CONFIG } from "./cloud-config.js?v=12";

const COLLECTION_NAME = "live_rooms";
const SDK_URL = "https://static.cloudbase.net/cloudbase-js-sdk/2.28.6/cloudbase.full.js";
const ROOM_ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
const ROOM_LENGTH = 10;
const ROOM_LIFETIME_MS = 7 * 24 * 60 * 60 * 1000;

let sdkPromise = null;
let clientPromise = null;

export function primarySiteUrl() {
  return CLOUDBASE_CONFIG.siteUrl || "";
}

export function realtimeConfigured(url = globalThis.location?.href || primarySiteUrl()) {
  if (!CLOUDBASE_CONFIG.envId || !url) return false;
  try {
    const currentHost = new URL(url).hostname;
    const primaryHost = new URL(primarySiteUrl()).hostname;
    return currentHost === primaryHost ||
      currentHost === "localhost" ||
      currentHost === "127.0.0.1";
  } catch {
    return false;
  }
}

export function makeRoomCode(bytes) {
  const source = bytes || globalThis.crypto?.getRandomValues?.(new Uint8Array(ROOM_LENGTH));
  if (!source || source.length < ROOM_LENGTH) {
    throw new Error("当前浏览器无法生成安全的共享房间号");
  }
  return Array.from(source)
    .slice(0, ROOM_LENGTH)
    .map(value => ROOM_ALPHABET[value % ROOM_ALPHABET.length])
    .join("");
}

export function buildLiveUrl(roomId, baseUrl = primarySiteUrl() || globalThis.location?.href || "") {
  const url = new URL(baseUrl);
  url.search = "";
  url.hash = "";
  url.searchParams.set("live", roomId);
  return url.toString();
}

export function roomIdFromUrl(url = globalThis.location?.href || "") {
  if (!url) return "";
  return (new URL(url).searchParams.get("live") || "")
    .trim()
    .toUpperCase()
    .replace(/[^23456789A-HJ-NP-Z]/g, "")
    .slice(0, ROOM_LENGTH);
}

export function sessionForLive(session) {
  if (!session) return null;
  const snapshot = JSON.parse(JSON.stringify(session));
  delete snapshot.liveShare;
  return snapshot;
}

function loadSdk() {
  if (globalThis.cloudbase) return Promise.resolve(globalThis.cloudbase);
  if (sdkPromise) return sdkPromise;
  if (typeof document === "undefined") {
    return Promise.reject(new Error("实时共享只能在网页中使用"));
  }
  sdkPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = SDK_URL;
    script.async = true;
    script.onload = () => globalThis.cloudbase
      ? resolve(globalThis.cloudbase)
      : reject(new Error("实时服务加载失败"));
    script.onerror = () => reject(new Error("实时服务加载失败，请检查网络后重试"));
    document.head.append(script);
  });
  return sdkPromise;
}

function authInstance(app) {
  return typeof app.auth === "function"
    ? app.auth({ persistence: "local" })
    : app.auth;
}

function userIdFrom(value) {
  return value?.data?.user?.id ||
    value?.data?.session?.sub ||
    value?.user?.id ||
    value?.user?.uid ||
    value?.uid ||
    "";
}

async function ensureAnonymousAuth(app) {
  const auth = authInstance(app);
  if (!auth) throw new Error("实时服务身份认证不可用");

  if (typeof auth.getLoginState === "function") {
    const loginState = await auth.getLoginState();
    if (loginState) return userIdFrom(loginState);
    if (typeof auth.signInAnonymously === "function") {
      return userIdFrom(await auth.signInAnonymously());
    }
    const provider = auth.anonymousAuthProvider?.();
    if (!provider?.signIn) throw new Error("匿名观战尚未在云端开启");
    return userIdFrom(await provider.signIn());
  }

  if (typeof auth.getSession === "function") {
    const sessionResult = await auth.getSession();
    if (sessionResult?.error) throw sessionResult.error;
    if (sessionResult?.data?.session) return userIdFrom(sessionResult);
    const loginResult = await auth.signInAnonymously();
    if (loginResult?.error) throw loginResult.error;
    return userIdFrom(loginResult);
  }

  throw new Error("匿名观战尚未在云端开启");
}

async function client() {
  if (!realtimeConfigured()) {
    throw new Error("实时服务还未连接完成");
  }
  if (!clientPromise) {
    clientPromise = (async () => {
      const cloudbase = await loadSdk();
      const app = cloudbase.init({
        env: CLOUDBASE_CONFIG.envId,
        region: CLOUDBASE_CONFIG.region
      });
      const ownerUid = await ensureAnonymousAuth(app);
      if (!ownerUid) throw new Error("无法取得实时共享身份");
      return {
        db: app.database(),
        ownerUid
      };
    })().catch(error => {
      clientPromise = null;
      throw error;
    });
  }
  return clientPromise;
}

function roomDocument(session, roomId, ownerUid) {
  const now = new Date();
  return {
    version: 1,
    roomId,
    ownerUid,
    visibility: "public",
    live: true,
    session: sessionForLive(session),
    createdAt: now,
    updatedAt: now,
    expiresAt: new Date(now.getTime() + ROOM_LIFETIME_MS)
  };
}

export async function createLiveRoom(session) {
  const { db, ownerUid } = await client();
  let lastError = null;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const roomId = makeRoomCode();
    try {
      await db.collection(COLLECTION_NAME).doc(roomId).set(roomDocument(session, roomId, ownerUid));
      return {
        roomId,
        url: buildLiveUrl(roomId)
      };
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError || new Error("创建实时房间失败");
}

export async function updateLiveRoom(roomId, session, live = true) {
  const { db } = await client();
  await db.collection(COLLECTION_NAME).doc(roomId).update({
    live,
    session: sessionForLive(session),
    updatedAt: new Date()
  });
}

export async function closeLiveRoom(roomId, session) {
  return updateLiveRoom(roomId, session, false);
}

export async function getLiveRoom(roomId) {
  const { db } = await client();
  const result = await db.collection(COLLECTION_NAME)
    .where({
      _id: roomId,
      visibility: "public"
    })
    .limit(1)
    .get();
  return result?.data?.[0] || null;
}

export async function watchLiveRoom(roomId, { onChange, onError }) {
  const { db } = await client();
  return db.collection(COLLECTION_NAME)
    .where({
      _id: roomId,
      visibility: "public"
    })
    .limit(1)
    .watch({
      onChange(snapshot) {
        onChange(snapshot?.docs?.[0] || null);
      },
      onError
    });
}
