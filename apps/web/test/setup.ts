import { cleanup } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { afterEach } from "vitest";
import { installResizeObserver } from "./support/resize-observer.ts";

// Testing Library only cleans up on its own when Vitest runs with globals, which this
// project does not; without this, one test's markup is still in the document for the next.
afterEach(cleanup);

// jsdom has none, and every render of the map asks for one.
installResizeObserver();
