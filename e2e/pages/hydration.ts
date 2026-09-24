import type { Page } from "@playwright/test";

declare global {
  interface Window {
    __e2eHydrated?: boolean;
  }
}

/**
 * Init script that flags the document once React has hydrated everything,
 * including content streamed into Suspense boundaries (the desk grid), and run
 * its effects. React reports every commit to the DevTools global hook, which
 * gives a precise signal without touching the app code.
 */
export function trackHydration() {
  // React's fiber tag for <Suspense>. A boundary with state is either still
  // dehydrated or showing its fallback.
  const SUSPENSE_TAG = 13;

  type Fiber = {
    tag: number;
    memoizedState: unknown;
    child: Fiber | null;
    sibling: Fiber | null;
  };

  function hasPendingSuspense(root: Fiber) {
    let stack: Fiber[] = [root];

    while (stack.length) {
      let fiber = stack.pop()!;

      if (fiber.tag === SUSPENSE_TAG && fiber.memoizedState !== null) {
        return true;
      }

      if (fiber.sibling) stack.push(fiber.sibling);
      if (fiber.child) stack.push(fiber.child);
    }

    return false;
  }

  Object.defineProperty(window, "__REACT_DEVTOOLS_GLOBAL_HOOK__", {
    configurable: true,
    value: {
      isDisabled: false,
      supportsFiber: true,
      renderers: new Map(),
      inject: () => 1,
      checkDCE: () => {},
      onCommitFiberUnmount: () => {},
      onPostCommitFiberRoot: () => {},
      onCommitFiberRoot: (_: number, root: { current: Fiber }) => {
        let settled = !hasPendingSuspense(root.current);

        // Passive effects (`useEffect`) are flushed after the commit; wait
        // for them so behaviour wired up in effects is live too.
        setTimeout(() => {
          window.__e2eHydrated = settled;
        });
      },
    },
  });
}

/**
 * Server rendered pages are visible before React has hydrated them, and an
 * interaction in that window is either lost (Radix triggers) or loses its side
 * effects (toasts). Wait until the page is really interactive.
 */
export async function waitForHydration(page: Page, timeout?: number) {
  await page.waitForFunction(() => window.__e2eHydrated === true, undefined, {
    timeout,
  });
}

/** `page.goto` that resolves only once the page is interactive. */
export async function gotoHydrated(page: Page, url: string) {
  await page.goto(url);
  await waitForHydration(page);
}
