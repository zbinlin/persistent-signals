import React, { createContext, useEffect } from "react";
import { getRegistryFrom } from "../../core/atom.js";
import { localStorageAdapter, type StorageAdapter } from "../../core/storage.js";

/**
 * SignalProvider 的 props 接口定义
 */
export interface SignalProviderProps {
    /**
     * 初始状态，用于测试或服务端渲染。
     */
    initialState?: Record<string, any>;
    /**
     * 是否启用持久化，默认为 true。设置为 false 时，所有状态将变为纯内存状态。
     */
    persistent?: boolean;
    storage?: StorageAdapter;
    children: React.ReactNode;
}

/**
 * React Context 用于在组件树中传递 Provider 的配置
 */
export const SignalContext = createContext<Partial<SignalProviderProps>>({});

/**
 * (内部使用) 创建一个高性能、带状态的安全刷新处理器。
 * @internal
 */
const createSafeFlushHandler = (storage: StorageAdapter) => {
    let isFlushing = false;

    return () => {
        if (isFlushing) return;
        isFlushing = true;

        try {
            const registry = getRegistryFrom(storage);
            if (!registry) return;
            for (const entry of registry.values()) {
                entry.flush();
            }
        } catch (error) {
            console.error("[persistent-signals] Error during safe flush:", error);
        } finally {
            // 确保在操作完成后重置标志
            isFlushing = false;
        }
    };
};

/**
 * 状态 Provider 组件。应包裹在应用的根节点。
 * 负责注册全局事件监听器（安全刷新、跨标签页同步）。
 */
export const SignalProvider: React.FC<SignalProviderProps> = ({
    initialState,
    persistent = true,
    storage = localStorageAdapter,
    children,
}) => {
    const isServer = typeof window === "undefined";

    useEffect(() => {
        // 在服务器端渲染（SSR）或非浏览器环境中，不执行任何操作
        if (isServer) return;

        // --- 注册全局事件监听器 ---
        const safeFlushHandler = createSafeFlushHandler(storage);

        // 1. 处理页面隐藏时的安全刷新
        const handleVisibilityChange = () => {
            if (document.visibilityState === "hidden") {
                safeFlushHandler();
            }
        };

        // 2. 注册监听器
        window.addEventListener("visibilitychange", handleVisibilityChange);
        window.addEventListener("pagehide", safeFlushHandler);
        const watchDispose = storage.watch?.();

        // 3. 返回一个清理函数，在组件卸载时移除所有监听器
        return () => {
            window.removeEventListener("visibilitychange", handleVisibilityChange);
            window.removeEventListener("pagehide", safeFlushHandler);
            watchDispose?.();
        };
    }, [isServer, storage]); // 依赖项确保逻辑在客户端仅运行一次

    return (
        <SignalContext.Provider value={{ initialState, persistent, storage }}>
            {children}
        </SignalContext.Provider>
    );
};
