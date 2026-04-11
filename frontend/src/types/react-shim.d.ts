// Minimal React type shims for environments where `@types/react` / `@types/react-dom`
// are not installed. This provides enough typing for `tsc` to run under `"strict": true`.

declare namespace React {
  type Key = string | number;
  type ReactText = string | number;
  type ReactNode = ReactText | boolean | null | undefined | ReactElement | ReactNode[];

  interface ReactElement<P = any, T extends string | JSXElementConstructor<any> = string | JSXElementConstructor<any>> {
    type: T;
    props: P;
    key: Key | null;
  }

  interface JSXElementConstructor<P> {
    (props: P): any;
  }

  type SetStateAction<S> = S | ((prevState: S) => S);
  type Dispatch<A> = (value: A) => void;
  interface Context<T> {
    Provider: any;
    Consumer: any;
  }

  interface Attributes {
    key?: Key;
  }

  interface RefObject<T> {
    current: T | null;
  }

  type Ref<T> = ((instance: T | null) => void) | RefObject<T> | null;

  interface HTMLAttributes<T> {
    className?: string;
    children?: ReactNode;
    [key: string]: any;
  }

  interface ButtonHTMLAttributes<T> extends HTMLAttributes<T> {
    disabled?: boolean;
    type?: string;
    onClick?: any;
  }

  interface ChangeEvent<T = any> {
    target: T;
  }

  interface FormEvent<T = any> {
    preventDefault(): void;
    target: T;
  }

  function createElement(...args: any[]): ReactElement;
  const Fragment: any;
  const StrictMode: any;
  const Suspense: any;

  function useState<S>(initialState: S | (() => S)): [S, Dispatch<SetStateAction<S>>];
  function useEffect(effect: any, deps?: any[]): void;
  function useMemo<T>(factory: () => T, deps: any[]): T;
  function createContext<T>(defaultValue: T): Context<T>;
  function useContext<T>(context: Context<T>): T;
  function useRef<T>(initialValue: T | null): RefObject<T>;
  function useCallback<T extends (...args: any[]) => any>(cb: T, deps: any[]): T;
  function useDeferredValue<T>(value: T): T;
  function lazy<T>(factory: () => Promise<{ default: T }>): T;

  function forwardRef<T, P = any>(render: (props: P, ref: Ref<T>) => any): any;
}

declare module 'react' {
  export = React;
  export as namespace React;
}

declare module 'react/jsx-runtime' {
  export const jsx: any;
  export const jsxs: any;
  export const Fragment: any;
}

declare module 'react-dom/server' {
  export function renderToString(node: any): string;
}

declare module 'react-dom/client' {
  export function createRoot(el: any): { render(node: any): void };
}

declare namespace JSX {
  interface IntrinsicElements {
    [elemName: string]: any;
  }
}
