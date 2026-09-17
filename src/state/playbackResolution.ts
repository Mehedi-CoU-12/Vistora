import { createStore, useStore } from './store';
















































export interface ResolutionState {
  isResolving: boolean;
  
  title: string | null;
}

const IDLE: ResolutionState = { isResolving: false, title: null };

const store = createStore<ResolutionState>(IDLE);








export function beginResolving(title: string): boolean {
  if (store.get().isResolving) {
    return false;
  }

  store.set({ isResolving: true, title });
  return true;
}








export function endResolving(): void {
  store.set(IDLE);
}

export function useResolutionState(): ResolutionState {
  return useStore(store);
}
