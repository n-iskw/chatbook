import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll } from "vitest";

/**
 * Global MSW server. Outbound `fetch()` is the only thing these tests mock;
 * routing, D1 and R2 run for real in the workerd pool. Register per-test
 * handlers with `server.use(...)`.
 */
export const server = setupServer();

// Fail on any outbound request that isn't explicitly mocked, so an unexpected
// fetch surfaces loudly instead of hitting the real DeepSeek API.
beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());
