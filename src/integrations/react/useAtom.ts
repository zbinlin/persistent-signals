import { useEffect, useContext, useRef } from "react";
import { type Signal } from "@preact/signals-core";
import { acquireEntry, type AtomConfig } from "../../core/atom.js";
import { SignalContext } from "./provider.js";
import { generateTabId } from "../../core/sync.js";
import { localStorageAdapter } from "../../core/storage.js";

/**
 * 在 React 组件中激活并使用一个全局的、持久化的状态。
 * 这个 Hook 负责状态的初始化、持久化副作用和跨标签页同步。
 *
 * @param config 包含 key 和 defaultValue 的配置对象。
 * @returns 一个已被正确初始化的、可供组件使用的全局单例 Signal 对象。
 */
export function useAtom<T>(config: AtomConfig<T>): Signal<T> {
    // 2. 获取上下文和环境状态
    const context = useContext(SignalContext);
    const { storage = localStorageAdapter, persistent = true, initialState } = context ?? [];
    const initialValueFromContext = initialState?.[config.key];

    const tabId = useRef(generateTabId()).current; // 使用 useRef 确保 tabId 在组件生命周期内稳定

    const registryEntry = acquireEntry(
        config,
        storage, {
            originId: tabId,
            overrideValue: initialValueFromContext as T | undefined,
            persistent,
        },
    );

    // 4. 持久化副作用
    useEffect(() => {
        registryEntry.mount();
        return () => {
            registryEntry.unmount();
        };
    }, [registryEntry]);

    return registryEntry.signal;
}
