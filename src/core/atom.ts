import { type Signal, signal, effect } from "@preact/signals-react";
import { debounce, type DebouncedFunction } from "../utils/debounce.js";
import { StorageAdapter } from "./storage.js";

// --- 核心类型定义 ---
export interface AtomConfig<T> {
    key: string;
    defaultValue: T;
}

export interface AtomState<T> {
    value: T;
    version: number;
    originId: string;
}

export interface AtomRegistryEntryOptions<T> {
    overrideValue?: T;
    originId?: string;
    persistent?: boolean;
}

/**
 * @internal
 */
export class AtomRegistryEntry<T> {
    public readonly config: AtomConfig<T>;

    #signal: Signal<T> | null;
    #refCount = 0;
    #version = 0;
    #originId?: string;
    #debouncedWrite?: DebouncedFunction<() => void>;
    #disposeEffect?: () => void;

    #storage: StorageAdapter;

    constructor(config: AtomConfig<T>, storage: StorageAdapter, options: AtomRegistryEntryOptions<T>) {
        this.config = config;
        this.#storage = storage;

        const { overrideValue, originId, persistent } = options;

        this.#originId = originId;
        let initialValue: T;

        if (overrideValue !== undefined) {
            initialValue = overrideValue;
        } else if (persistent) {
            try {
                const stored = this.#storage.getItem(this.config.key);
                if (stored !== null) {
                    const parsed = JSON.parse(stored) as AtomState<T>;
                    initialValue = parsed.value;
                    this.#version = parsed.version || 0;
                } else {
                    initialValue = this.config.defaultValue;
                }
            } catch (e) {
                console.error(`[persistent-signals] Error reading key "${this.config.key}"`, e);
                initialValue = this.config.defaultValue;
            }
        } else {
            initialValue = this.config.defaultValue;
        }

        this.#signal = signal<T>(initialValue);
    }

    get signal() {
        if (!this.#signal) {
            throw new Error("The signal does not initilized");
        }
        return this.#signal;
    }

    get originId() {
        return this.#originId;
    }

    /**
     * 当组件挂载时调用，增加引用计数并按需设置持久化。
     */
    public mount() {
        this.#refCount++;
        if (this.#refCount === 1) {
            this.setupPersistence();
        }
    }

    /**
     * 当组件卸载时调用，减少引用计数并按需清理资源。
     */
    public unmount() {
        this.#refCount--;
        if (this.#refCount === 0) {
            this.cleanupPersistence();
        }
    }

    /**
     * Receives a remote state and applies it to the local signal
     * if the conflict resolution rules pass.
     */
    public syncWith(remoteState: AtomState<T>) {
        const remoteVersion = remoteState.version;
        const localVersion = this.#version;

        let actionTaken = "ignored";
        let shouldUpdate = false;

        if (remoteVersion > localVersion) {
            shouldUpdate = true;
            actionTaken = "accepted (newer version)";
        } else if (remoteVersion === localVersion) {
            // Tie-breaking with originId if versions are the same
            if (this.#originId && remoteState.originId.localeCompare(this.#originId) > 0) {
                shouldUpdate = true;
                actionTaken = "accepted (conflict resolved by originId)";
            }
        } else {
            actionTaken = `ignored (older version: local v${localVersion} > remote v${remoteVersion})`;
        }

        if (shouldUpdate) {
            this.signal.value = remoteState.value;
            this.#version = remoteState.version;
        }

        // 8. 开发环境日志
        if (process.env.NODE_ENV === "development" && actionTaken.startsWith("accepted")) {
            console.debug(
                `[Sync] Key: ${this.config.key}\n` +
                    `       Local:  v${localVersion} (id: ${this.originId?.substring(0, 6)})\n` +
                    `       Remote: v${remoteVersion} (id: ${remoteState.originId.substring(0, 6)})\n` +
                    `       Action: ${actionTaken}`
            );
        }
    }

    /**
     * If there is a pending debounced write, flush it immediately.
     */
    public flush() {
        this.#debouncedWrite?.flush();
    }

    public [Symbol.dispose]() {
        this.cleanupPersistence();
    }

    // --- 私有方法 ---

    private setupPersistence() {
        const writeToStorage = () => {
            try {
                this.#version++;
                this.#storage.setItem(
                    this.config.key,
                    JSON.stringify({
                        value: this.signal.value,
                        version: this.#version,
                        originId: this.#originId,
                    })
                );
            } catch (error) {
                console.error(`[persistent-signals] Error writing key "${this.config.key}"`, error);
            }
        };

        this.#debouncedWrite = debounce(writeToStorage, 100, { trailing: true });
        this.#disposeEffect = effect(() => {
            void this.signal.value;
            this.#debouncedWrite?.();
        });
    }

    private cleanupPersistence() {
        this.#debouncedWrite?.flush();
        this.#disposeEffect?.();
        this.#debouncedWrite = undefined;
        this.#disposeEffect = undefined;
    }
}


// 全局的、以 StorageAdapter 为键的注册表管理器
const storageRegistryMap = new WeakMap<StorageAdapter, Map<string, AtomRegistryEntry<unknown>>>();

/**
 * (内部使用) 为给定的存储适配器获取或创建其专属的状态注册表。
 * @internal
 */
function getRegistryForStorage(storage: StorageAdapter): Map<string, AtomRegistryEntry<unknown>> {
    if (!storageRegistryMap.has(storage)) {
        storageRegistryMap.set(storage, new Map<string, AtomRegistryEntry<unknown>>());
    }
    return storageRegistryMap.get(storage)!;
}

export function acquireEntry<T>(
	atomConfig: AtomConfig<T>,
	storage: StorageAdapter,
	initOptions: AtomRegistryEntryOptions<T>,
): AtomRegistryEntry<T> {
    // 1. 参数验证
    if (!atomConfig.key || typeof atomConfig.key !== "string") {
        throw new Error("[persistent-signals] Atom key must be a non-empty string.");
    }

	 const atomRegistry = getRegistryForStorage(storage);

    // 2. 检查现有注册
    const existingEntry = atomRegistry.get(atomConfig.key);
    if (existingEntry) {
        // 开发环境警告：检查 defaultValue 是否一致
        if (process.env.NODE_ENV !== "production") {
            // 使用 JSON.stringify 来进行深比较
            const oldDefault = JSON.stringify(existingEntry.config.defaultValue);
            const newDefault = JSON.stringify(atomConfig.defaultValue);
            if (oldDefault !== newDefault) {
                console.warn(
                    `[persistent-signals] Atom with key "${atomConfig.key}" was already registered with a different defaultValue.\n` +
                        `Existing: ${oldDefault}\n` +
                        `New: ${newDefault}`
                );
            }
        }
        return existingEntry as AtomRegistryEntry<T>;
    }

    const newEntry = new AtomRegistryEntry<T>(atomConfig, storage, initOptions);
    atomRegistry.set(atomConfig.key, newEntry);
    return newEntry;
}

/**
 * @internal
 */
export function getRegistryFrom(storage: StorageAdapter) {
    return storageRegistryMap.get(storage);
}

/**
 * (内部使用) 获取指定 key 的注册表条目。
 * @internal
 */
export function getAtomEntryFrom<T>(storage: StorageAdapter, key: string): AtomRegistryEntry<T> | undefined {
    return storageRegistryMap.get(storage)?.get(key) as AtomRegistryEntry<T> | undefined;
}

/**
 * (供测试或特殊场景使用) 清理所有已注册的 atom 及其副作用。
 */
export function cleanupAtomRegistry(storage: StorageAdapter) {
    const atomRegistry = getRegistryFrom(storage);
    if (!atomRegistry) return;
    for (const entry of atomRegistry.values()) {
        entry[Symbol.dispose]?.();
    }
    atomRegistry.clear();
}
