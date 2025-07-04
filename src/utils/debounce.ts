/**
 * Debounce 函数的配置选项。
 */
export interface DebounceOptions {
    /**
     * 是否在超时前沿调用函数。
     * @default false
     */
    leading?: boolean;

    /**
     * 函数被允许延迟执行的最长时间（毫秒）。
     */
    maxWait?: number;

    /**
     * 是否在超时后沿调用函数。
     * @default true
     */
    trailing?: boolean;
}

/**
 * 经过防抖处理的函数，它还附带了 `cancel` 和 `flush` 方法。
 */
export interface DebouncedFunction<T extends (...args: unknown[]) => unknown> {
    /**
     * 调用防抖函数。
     */
    (...args: Parameters<T>): ReturnType<T> | undefined;

    /**
     * 取消延迟的函数调用。
     */
    cancel(): void;

    /**
     * 立即调用任何挂起的函数。
     */
    flush(): ReturnType<T> | undefined;
}

/**
 * 创建一个防抖函数，该函数会延迟调用 `func`，直到自上次调用防抖函数后过了 `wait` 毫秒。
 *
 * @template T 要进行防抖处理的函数类型。
 * @param func 要进行防抖处理的函数。
 * @param wait 需要延迟的毫秒数，默认为 0。
 * @param options 配置选项对象。
 * @returns 返回一个新的防-抖动过的函数。
 */
export function debounce<T extends (...args: any[]) => any>(
    func: T,
    wait = 0,
    options: DebounceOptions = {}
): DebouncedFunction<T> {
    // --- 状态变量 ---
    let lastArgs: Parameters<T> | undefined;
    let lastThis: ThisParameterType<T> | undefined;
    let result: ReturnType<T> | undefined;
    let timerId: ReturnType<typeof setTimeout> | undefined;
    let lastCallTime: number | undefined;

    let lastInvokeTime = 0;

    // --- 选项处理 ---
    const { leading = false, trailing = true } = options;
    const maxing = "maxWait" in options;
    const maxWait = maxing ? Math.max(options.maxWait ?? 0, wait) : undefined;

    // --- 核心逻辑 ---

    const invokeFunc = (time: number): ReturnType<T> => {
        const args = lastArgs;
        const thisArg = lastThis;

        lastArgs = lastThis = undefined;
        lastInvokeTime = time;
        result = func.apply(thisArg, args!);
        return result!;
    };

    const startTimer = (pendingFunc: () => void, waitTime: number) => {
        if (timerId !== undefined) {
            clearTimeout(timerId);
        }
        timerId = setTimeout(pendingFunc, waitTime);
    };

    const remainingWait = (time: number): number => {
        const timeSinceLastCall = time - (lastCallTime ?? 0);
        const timeSinceLastInvoke = time - lastInvokeTime;
        const timeWaiting = wait - timeSinceLastCall;

        if (maxing && maxWait !== undefined) {
            return Math.min(timeWaiting, maxWait - timeSinceLastInvoke);
        }
        return timeWaiting;
    };

    const shouldInvoke = (time: number): boolean => {
        const timeSinceLastCall = time - (lastCallTime ?? 0);
        const timeSinceLastInvoke = time - lastInvokeTime;

        // 首次调用、距离上次调用时间足够长、系统时间倒退、或达到最大等待时间
        return (
            lastCallTime === undefined ||
                timeSinceLastCall >= wait ||
                timeSinceLastCall < 0 ||
                (maxing && maxWait !== undefined && timeSinceLastInvoke >= maxWait)
        );
    };

    const trailingEdge = (time: number) => {
        timerId = undefined;

        // 只有在 trailing 为 true 且有过至少一次延迟调用时才执行
        if (trailing && lastArgs) {
            return invokeFunc(time);
        }
        lastArgs = lastThis = undefined;
        return result;
    };

    const timerExpired = () => {
        const time = Date.now();
        if (shouldInvoke(time)) {
            trailingEdge(time);
        } else {
            // 否则，重置计时器
            startTimer(timerExpired, remainingWait(time));
        }
    };

    const leadingEdge = (time: number) => {
        lastInvokeTime = time;
        startTimer(timerExpired, wait);
        return leading ? invokeFunc(time) : result;
    };

    // --- 对外暴露的接口 ---

    const cancel = (): void => {
        if (timerId !== undefined) {
            clearTimeout(timerId);
        }
        lastInvokeTime = 0;
        lastArgs = lastCallTime = lastThis = timerId = undefined;
    };

    const flush = (): ReturnType<T> | undefined => {
        return timerId === undefined ? result! : trailingEdge(Date.now());
    };

    function debounced(
        this: ThisParameterType<T>,
        ...args: Parameters<T>
    ): ReturnType<T> | undefined {
        const time = Date.now();
        const isInvoking = shouldInvoke(time);

        lastArgs = args;
        lastThis = this;
        lastCallTime = time;

        if (isInvoking) {
            if (timerId === undefined) {
                return leadingEdge(lastCallTime);
            }
            if (maxing) {
                // 在紧凑循环中处理调用
                startTimer(timerExpired, wait);
                return invokeFunc(lastCallTime);
            }
        }
        if (timerId === undefined) {
            startTimer(timerExpired, wait);
        }
        return result;
    }

    debounced.cancel = cancel;
    debounced.flush = flush;

    return debounced;
}


export interface ThrottleOptions {
    leading?: boolean;
    trailing?: boolean;
}

export function throttle<T extends (...args: any[]) => any>(
    func: T,
    wait: number,
    options: ThrottleOptions = {}
): DebouncedFunction<T> {
    return debounce(func, wait, {
        trailing: true,
        leading: true,
        ...options,
        maxWait: wait,
    });
}
