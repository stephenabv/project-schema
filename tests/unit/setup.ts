// "server-only" throws outside a React Server environment; unit tests run in plain Node.
import { vi } from "vitest";

vi.mock("server-only", () => ({}));
