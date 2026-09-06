import { useEffect } from "react";
import { useMap } from "react-leaflet";

/**
 * Leaflet measures its container when it is created and never watches it again, so any
 * later change of size leaves a strip of empty background where tiles should be — with
 * markers still positioned into it, which is what makes it read as broken rather than as
 * unfinished.
 *
 * On a phone that happens on the first scroll. The layout is `dvh`, which is dynamic by
 * definition: the viewport grows the moment the browser hides its URL bar. An orientation
 * change and the wide layout's column do the same thing more obviously.
 *
 * `invalidateSize(false)` skips the pan animation, because a collapsing URL bar delivers a
 * run of resizes rather than one.
 */
export function KeepMapSized() {
  const map = useMap();

  useEffect(() => {
    const observer = new ResizeObserver(() => map.invalidateSize(false));
    observer.observe(map.getContainer());
    return () => observer.disconnect();
  }, [map]);

  return null;
}
