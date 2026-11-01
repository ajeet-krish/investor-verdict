export function createEmitter() {
    const listeners = new Map();

    function getSet(event) {
        let set = listeners.get(event);
        if (!set) {
            set = new Set();
            listeners.set(event, set);
        }
        return set;
    }

    function on(event, fn) {
        const set = getSet(event);
        set.add(fn);
        return function unsubscribe() {
            off(event, fn);
        };
    }

    function off(event, fn) {
        const set = listeners.get(event);
        if (!set) {
            return;
        }
        set.delete(fn);
        if (set.size === 0) {
            listeners.delete(event);
        }
    }

    function emit(event, payload) {
        const set = listeners.get(event);
        if (!set || set.size === 0) {
            return 0;
        }
        const fns = Array.from(set);
        for (let i = 0; i < fns.length; i += 1) {
            fns[i](payload);
        }
        return fns.length;
    }

    function clear(event) {
        if (event) {
            listeners.delete(event);
            return;
        }
        listeners.clear();
    }

    return { on, off, emit, clear };
}
