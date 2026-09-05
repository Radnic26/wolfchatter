import type { LatLng } from "leaflet";
import { useEffect, useRef, useState } from "react";
import { useMap, useMapEvents } from "react-leaflet";
import { createTapRecogniser, type Press } from "./tap-gesture.ts";

type MapTapsProps = {
  onTap: (point: LatLng) => void;
};

function toPress(event: PointerEvent): Press {
  return { x: event.clientX, y: event.clientY, time: event.timeStamp };
}

/**
 * Pointer events say whether the gesture was a tap; Leaflet's click says where on the globe
 * it landed, and only fires for the map itself, so a marker or a zoom button never reaches
 * here. The click follows the release, which is why the verdict is waiting by the time it
 * arrives.
 */
export function MapTaps({ onTap }: MapTapsProps) {
  const map = useMap();
  const [recogniser] = useState(createTapRecogniser);
  const opensRoom = useRef(false);

  useEffect(() => {
    const container = map.getContainer();
    const press = (event: PointerEvent) => recogniser.press(toPress(event));
    const release = (event: PointerEvent) => {
      opensRoom.current = recogniser.release(toPress(event));
    };

    container.addEventListener("pointerdown", press);
    container.addEventListener("pointerup", release);
    return () => {
      container.removeEventListener("pointerdown", press);
      container.removeEventListener("pointerup", release);
    };
  }, [map, recogniser]);

  useMapEvents({
    click(event) {
      if (opensRoom.current) onTap(event.latlng);
    },
  });

  return null;
}
