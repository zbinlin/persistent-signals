import { getAtomEntryFrom, type AtomState } from "./atom.js";
import { generateTabId } from "./sync.js";

/**
 * Defines the contract for any storage adapter.
 * Our library can work with any object that implements this interface.
 */
export interface StorageAdapter {
    getItem(key: string): string | null;
    setItem(key: string, value: string): void;
    removeItem(key: string): void;
    watch?: () => () => void;
}

/**
 * The default adapter, which uses the browser's localStorage.
 */
export const localStorageAdapter: StorageAdapter = {
    getItem(key: string): string | null {
        console.log("GeT:", key);
        return localStorage.getItem(key);
    },
    setItem(key: string, value: string): void {
        console.log("SeT:", key, value);
        localStorage.setItem(key, value);
    },
    removeItem(key: string): void {
        console.log("RE:", key);
        localStorage.removeItem(key);
    },
    watch() {
        console.log("watching");
        window.addEventListener("storage", handleStorageChange);
        return () => {
            console.log("unwatched");
            window.removeEventListener("storage", handleStorageChange);
        };
    },
};

// 在模块加载时获取一次本地标签页ID
const localTabId = generateTabId();
/**
 * 处理 "storage" 事件，实现跨标签页同步。
 * @param event StorageEvent
 * @internal
 */
function handleStorageChange(event: StorageEvent) {
    // 1. 基本的事件有效性检查
    if (!event.key || event.newValue === null) {
        return;
    }

    // 2. 检查这个 key 是否是我们管理的 atom
    const entry = getAtomEntryFrom(localStorageAdapter, event.key);
    if (!entry) {
        return;
    }

    // 3. 解析来自其他标签页的新数据
    let remoteState: AtomState<unknown>;
    try {
        remoteState = JSON.parse(event.newValue);
    } catch (e) {
        console.error(`[persistent-signals] Failed to parse storage event value for key "${event.key}"`, e);
        return;
    }

    // 4. 验证远程数据结构
    if (
        remoteState.value === undefined ||
        typeof remoteState.version !== "number" ||
        typeof remoteState.originId !== "string"
    ) {
        if (process.env.NODE_ENV === "development") {
            console.warn(`[persistent-signals] Invalid remote state structure for key "${event.key}"`, remoteState);
        }
        return;
    }

    // 5. 不处理由自己标签页触发的事件
    if (remoteState.originId === localTabId) {
        return;
    }

    entry.syncWith(remoteState);
}
