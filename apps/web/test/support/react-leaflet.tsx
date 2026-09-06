import { type ReactNode, useState } from "react";
import { vi } from "vitest";

type Point = { lat: number; lng: number };
type LatLng = Point & { wrap: () => LatLng };
type MapHandlers = { click?: (event: { latlng: LatLng }) => void };

/** Leaflet's own `wrapNum` over the `[-180, 180]` of CRS.Earth, where the maximum stays put. */
function wrapLongitude(lng: number): number {
  return lng === 180 ? lng : ((((lng + 180) % 360) + 360) % 360) - 180;
}

/**
 * `LatLng.wrap()` folds the longitude back onto the primary copy of the world and leaves the
 * latitude alone. The arithmetic is Leaflet's rather than a fixed answer, because what the
 * app relies on is the fold itself.
 */
function latLng({ lat, lng }: Point): LatLng {
  return { lat, lng, wrap: () => latLng({ lat, lng: wrapLongitude(lng) }) };
}

/**
 * jsdom has no map, so `react-leaflet` is replaced by the smallest thing the components
 * need: the element they attach pointer listeners to, the handlers they register, and the
 * moves they ask for. Everything a test drives or inspects hangs off here.
 */
export const leafletTestbed = {
  container: document.createElement("div"),
  handlers: {} as MapHandlers,
  visibleBounds: true,
  flyTo: vi.fn<(position: [number, number], zoom: number) => void>(),
  setView: vi.fn<(position: [number, number], zoom: number) => void>(),

  reset() {
    leafletTestbed.container.remove();
    leafletTestbed.container = document.createElement("div");
    document.body.append(leafletTestbed.container);
    leafletTestbed.handlers = {};
    leafletTestbed.visibleBounds = true;
    leafletTestbed.flyTo.mockClear();
    leafletTestbed.setView.mockClear();
  },

  clickMap(point: Point) {
    leafletTestbed.handlers.click?.({ latlng: latLng(point) });
  },

  /**
   * The time is given rather than measured: how far apart two dispatches land is a property
   * of the machine, and a double click that only counts as one because the laptop was quick
   * would prove nothing on a slower one.
   */
  pointer(type: "pointerdown" | "pointerup", { x, y, at }: { x: number; y: number; at: number }) {
    const event = new MouseEvent(type, { clientX: x, clientY: y, bubbles: true });
    Object.defineProperty(event, "timeStamp", { value: at });
    leafletTestbed.container.dispatchEvent(event);
  },
};

const fakeMap = {
  getContainer: () => leafletTestbed.container,
  getBounds: () => ({ contains: () => leafletTestbed.visibleBounds }),
  getZoom: () => 5,
  flyTo: leafletTestbed.flyTo,
  setView: leafletTestbed.setView,
};

type MarkerProps = {
  position: [number, number];
  icon: { options: { html?: string } };
  zIndexOffset: number;
  title: string;
  autoPanOnFocus: boolean;
  eventHandlers: {
    click: () => void;
    keydown: (event: { originalEvent: KeyboardEvent }) => void;
  };
};

type MapProps = {
  children: ReactNode;
  zoomAnimation: boolean;
  fadeAnimation: boolean;
  markerZoomAnimation: boolean;
};

export function mockReactLeaflet() {
  return {
    MapContainer: ({ children, zoomAnimation, fadeAnimation, markerZoomAnimation }: MapProps) => (
      <div
        data-testid="map"
        data-zoom-animation={String(zoomAnimation)}
        data-fade-animation={String(fadeAnimation)}
        data-marker-zoom-animation={String(markerZoomAnimation)}
      >
        {children}
      </div>
    ),

    TileLayer: ({ url, attribution, maxZoom }: { url: string; attribution: string; maxZoom: number }) => (
      <div data-testid="tiles" data-url={url} data-attribution={attribution} data-max-zoom={maxZoom} />
    ),

    Marker: ({ position, icon, zIndexOffset, title, autoPanOnFocus, eventHandlers }: MarkerProps) => {
      // Leaflet writes `title` onto the icon element when it builds it, and react-leaflet
      // updates only position, icon, z-index, opacity and draggable afterwards. So a name
      // that arrives after mount never reaches the real map, and a double that renders the
      // current one would let a test prove something the map does not do.
      const [nameAtMount] = useState(title);

      // A `div` with `role="button"`, which is what Leaflet builds. A real `<button>` turns
      // Enter into a click on its own, and a spec written against one would pass with no
      // key handler at all — the map does not, which is the whole point of handling keys.
      return (
        // biome-ignore lint/a11y/useSemanticElements: this is the div Leaflet itself builds
        <div
          role="button"
          tabIndex={0}
          data-testid="marker"
          data-position={position.join(",")}
          data-icon={icon.options.html}
          data-z={zIndexOffset}
          data-auto-pan-on-focus={String(autoPanOnFocus)}
          onClick={eventHandlers.click}
          onKeyDown={(event) => eventHandlers.keydown({ originalEvent: event.nativeEvent })}
        >
          {nameAtMount}
        </div>
      );
    },

    useMap: () => fakeMap,

    useMapEvents: (handlers: MapHandlers) => {
      leafletTestbed.handlers = handlers;
      return fakeMap;
    },
  };
}
