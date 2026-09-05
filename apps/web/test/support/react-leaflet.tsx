import { type ReactNode, useState } from "react";
import { vi } from "vitest";

type LatLng = { lat: number; lng: number };
type MapHandlers = { click?: (event: { latlng: LatLng }) => void };

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

  clickMap(latlng: LatLng) {
    leafletTestbed.handlers.click?.({ latlng });
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
  eventHandlers: { click: () => void };
};

export function mockReactLeaflet() {
  return {
    MapContainer: ({ children }: { children: ReactNode }) => <div>{children}</div>,

    TileLayer: ({ url, attribution, maxZoom }: { url: string; attribution: string; maxZoom: number }) => (
      <div data-testid="tiles" data-url={url} data-attribution={attribution} data-max-zoom={maxZoom} />
    ),

    Marker: ({ position, icon, zIndexOffset, title, eventHandlers }: MarkerProps) => {
      // Leaflet writes `title` onto the icon element when it builds it, and react-leaflet
      // updates only position, icon, z-index, opacity and draggable afterwards. So a name
      // that arrives after mount never reaches the real map, and a double that renders the
      // current one would let a test prove something the map does not do.
      const [nameAtMount] = useState(title);

      return (
        <button
          type="button"
          data-testid="marker"
          data-position={position.join(",")}
          data-icon={icon.options.html}
          data-z={zIndexOffset}
          onClick={eventHandlers.click}
        >
          {nameAtMount}
        </button>
      );
    },

    useMap: () => fakeMap,

    useMapEvents: (handlers: MapHandlers) => {
      leafletTestbed.handlers = handlers;
      return fakeMap;
    },
  };
}
