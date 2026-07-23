import React, { useEffect, useRef, useState } from "react";
import "mapbox-gl/dist/mapbox-gl.css";

const STATES_GEOJSON =
  "https://docs.mapbox.com/mapbox-gl-js/assets/ne_110m_admin_1_states_provinces_shp.geojson";

const MAP_CENTER = [-98.5, 37.5];
const MAP_ZOOM = 4.45;

export default function StateLoginMap({ onStateClick }) {
  const mapContainerRef = useRef(null);
  const mapRef = useRef(null);
  const hoveredFeatureIdRef = useRef(null);
  const [hoveredState, setHoveredState] = useState(null);

  useEffect(() => {
    const token = process.env.REACT_APP_MAPBOX_TOKEN;
    if (!token || !mapContainerRef.current || mapRef.current) return undefined;

    let cancelled = false;

    async function initializeMap() {
      const mapboxModule = await import("mapbox-gl");
      if (cancelled || !mapContainerRef.current || mapRef.current) return;

      const mapboxgl = mapboxModule.default || mapboxModule;
      mapboxgl.accessToken = token;

      const map = new mapboxgl.Map({
        container: mapContainerRef.current,
        style: "mapbox://styles/mapbox/standard",
        center: MAP_CENTER,
        zoom: MAP_ZOOM,
        minZoom: 3.4,
        maxZoom: 7.5,
        attributionControl: false,
      });

      mapRef.current = map;
      map.addControl(new mapboxgl.AttributionControl({ compact: true }), "bottom-right");

      map.on("load", () => {
        map.addSource("login-states", {
          type: "geojson",
          data: STATES_GEOJSON,
          generateId: true,
        });

        map.addLayer({
          id: "login-state-fills",
          type: "fill",
          source: "login-states",
          filter: ["==", ["get", "admin"], "United States of America"],
          paint: {
            "fill-color": [
              "case",
              ["boolean", ["feature-state", "hover"], false],
              "rgba(244, 162, 97, 0.64)",
              "rgba(75, 137, 220, 0.30)",
            ],
            "fill-outline-color": "rgba(20, 43, 68, 0.72)",
          },
        });

        map.addLayer({
          id: "login-state-borders",
          type: "line",
          source: "login-states",
          filter: ["==", ["get", "admin"], "United States of America"],
          paint: {
            "line-color": "rgba(31, 45, 61, 0.72)",
            "line-width": [
              "case",
              ["boolean", ["feature-state", "hover"], false],
              2.2,
              0.8,
            ],
          },
        });

        map.on("mousemove", "login-state-fills", (event) => {
          const feature = event.features?.[0];
          const stateName = feature?.properties?.name;
          if (!feature || !stateName) return;

          if (hoveredFeatureIdRef.current !== null) {
            map.setFeatureState(
              { source: "login-states", id: hoveredFeatureIdRef.current },
              { hover: false }
            );
          }

          hoveredFeatureIdRef.current = feature.id;
          map.setFeatureState(
            { source: "login-states", id: hoveredFeatureIdRef.current },
            { hover: true }
          );

          setHoveredState({
            name: stateName,
            x: event.point.x,
            y: event.point.y,
          });
          map.getCanvas().style.cursor = "pointer";
        });

        map.on("mouseleave", "login-state-fills", () => {
          if (hoveredFeatureIdRef.current !== null) {
            map.setFeatureState(
              { source: "login-states", id: hoveredFeatureIdRef.current },
              { hover: false }
            );
          }
          hoveredFeatureIdRef.current = null;
          setHoveredState(null);
          map.getCanvas().style.cursor = "";
        });

        map.on("click", "login-state-fills", (event) => {
          const stateName = event.features?.[0]?.properties?.name;
          if (stateName && onStateClick) {
            onStateClick(stateName);
          }
        });
      });
    }

    initializeMap();

    return () => {
      cancelled = true;
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
      hoveredFeatureIdRef.current = null;
    };
  }, [onStateClick]);

  if (!process.env.REACT_APP_MAPBOX_TOKEN) {
    return (
      <div className="state-map-token-missing">
        Mapbox token is missing. Set REACT_APP_MAPBOX_TOKEN to load the login map.
      </div>
    );
  }

  return (
    <div className="state-login-map-shell">
      <div ref={mapContainerRef} className="state-login-map" />
      <div className="state-login-map-vignette" aria-hidden="true" />
      {hoveredState ? (
        <div
          className="state-hover-tooltip"
          style={{
            transform: `translate(${hoveredState.x + 16}px, ${hoveredState.y + 16}px)`,
          }}
        >
          {hoveredState.name}
        </div>
      ) : null}
    </div>
  );
}
