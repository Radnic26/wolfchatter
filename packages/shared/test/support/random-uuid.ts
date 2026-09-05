/**
 * This package compiles without Node's or the DOM's types, so that a native shell can use
 * it unchanged; the global both runtimes provide is declared here rather than dragged in as
 * a dependency. Ids are real and random, because a fixture with tidy ascending ids proves
 * a property of the test data rather than of the code.
 */
declare const crypto: { randomUUID: () => string };

export function randomUuid(): string {
  return crypto.randomUUID();
}
