import { type Signal } from "@preact/signals-react";
import { type AtomConfig } from "../../core/atom.js";
import { useAtom } from "./useAtom.js";

/**
 * 创建一个与组件实例生命周期绑定的、持久化的 state。
 * 它的值会被保存到 localStorage，但在标签页之间不会自动同步。
 * @param localKey 状态的名称，如 "isOpen"。
 * @param scopeId 一个能唯一标识该组件实例的稳定ID。
 * @param defaultValue 状态的默认值。
 * @returns 一个 state signal。
 */
export function useExclusiveState<T>(
    localKey: string,
    scopeId: string | number,
    defaultValue: T
): Signal<T> {
    // Combine the local key and scope ID to create a globally unique key
    // that can be managed by our central atom system.
    const uniqueKey = `exclusive::${scopeId}::${localKey}`;

    // Create the configuration object for the atom.
    const atomConfig: AtomConfig<T> = {
        key: uniqueKey,
        defaultValue: defaultValue,
    };

    // Delegate all the heavy lifting to our robust `useAtom` hook.
    return useAtom(atomConfig);
}
