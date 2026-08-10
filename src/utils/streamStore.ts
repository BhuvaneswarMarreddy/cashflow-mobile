import { create, type StoreApi, type UseBoundStore } from 'zustand';

export interface StreamState<T> {
  /** Newest first. */
  entries: readonly T[];
  push: (entry: T) => void;
  clear: () => void;
}

/**
 * A bounded, newest-first, subscribable buffer.
 *
 * The three developer streams (logs, interaction events, system audit) are each
 * one of these. Bounded on purpose — an unbounded diagnostics buffer is a
 * memory leak that only shows up in a long session on a real phone.
 */
export const createStreamStore = <T>(capacity: number): UseBoundStore<StoreApi<StreamState<T>>> =>
  create<StreamState<T>>((set) => ({
    entries: [],
    push: (entry) => set((state) => ({ entries: [entry, ...state.entries].slice(0, capacity) })),
    clear: () => set({ entries: [] }),
  }));
