type ScrollBox = {
  scrollTop: number;
  scrollHeight: number;
  clientHeight: number;
};

/** A line's worth of slack: a reader this close to the end is reading the end. */
const SLACK_IN_PIXELS = 32;

export function isShowingNewest({ scrollTop, scrollHeight, clientHeight }: ScrollBox): boolean {
  return scrollHeight - scrollTop - clientHeight <= SLACK_IN_PIXELS;
}
