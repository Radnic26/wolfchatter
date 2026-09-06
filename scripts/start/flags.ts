import { parseArgs } from "node:util";

export type Flags = {
  printsUsage: boolean;
  /** A flag nobody offers: the usage is still the answer, but the run has failed. */
  carriesAnUnknownFlag: boolean;
  takesDefaults: boolean;
  rewritesEnvFile: boolean;
};

/**
 * The whole surface `docs/architecture.md` §11 promises, and nothing else. A flag nobody
 * offers is a typo, and the shortest way out of a typo is the list of what exists, so the
 * parse error becomes the usage rather than a Docker build of a misread intention.
 */
export function parseFlags(argv: readonly string[]): Flags {
  try {
    const { values } = parseArgs({
      args: [...argv],
      options: {
        yes: { type: "boolean", short: "y", default: false },
        reconfigure: { type: "boolean", default: false },
        help: { type: "boolean", default: false },
      },
    });

    return {
      printsUsage: values.help,
      carriesAnUnknownFlag: false,
      takesDefaults: values.yes,
      rewritesEnvFile: values.reconfigure,
    };
  } catch {
    return { printsUsage: true, carriesAnUnknownFlag: true, takesDefaults: false, rewritesEnvFile: false };
  }
}
