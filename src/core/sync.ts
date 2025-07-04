/**
 * 生成当前标签页的唯一ID（整个应用生命周期内不变）
 * @returns 标签页唯一ID字符串
 */
export function generateTabId(): string {
    // 使用 Symbol 创建完全唯一的属性键
    if (typeof globalThis !== "undefined") {
        const TAB_ID_SYMBOL = Symbol.for("persistent-signals/tab-id");
        // 检查是否已存在
        if (!(TAB_ID_SYMBOL in globalThis)) {
            // 创建安全的标签页ID
            const tabId = [
                Math.random().toString(36).substring(2, 10),
                Date.now().toString(36),
                Math.random().toString(36).substring(2, 6)
            ].join("-");

            // 定义不可变属性
            Object.defineProperty(globalThis, TAB_ID_SYMBOL, {
                value: tabId,
                writable: false,
                configurable: false,
                enumerable: false
            });
        }

        // 类型安全访问
        return (globalThis as any)[TAB_ID_SYMBOL];
    }

    return "SERVER-TAB";
}
