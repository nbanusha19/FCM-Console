import { useEffect, useRef } from "react";
import type * as Leaflet from "leaflet";
import "leaflet/dist/leaflet.css";

const DEFAULT_CENTER: [number, number] = [20, 0];

export function BranchGeofenceMap({
  latitude,
  longitude,
  onSelect,
}: {
  latitude: number | null;
  longitude: number | null;
  onSelect: (latitude: number, longitude: number) => void;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<Leaflet.Map | null>(null);
  const markerRef = useRef<Leaflet.CircleMarker | null>(null);
  const onSelectRef = useRef(onSelect);
  const selectedRef = useRef<[number, number] | null>(null);

  onSelectRef.current = onSelect;
  selectedRef.current =
    latitude != null && longitude != null ? [latitude, longitude] : null;

  useEffect(() => {
    let cancelled = false;
    let map: Leaflet.Map | null = null;
    let marker: Leaflet.CircleMarker | null = null;

    void import("leaflet").then((L) => {
      if (cancelled || !containerRef.current) return;

      const selected = selectedRef.current;
      map = L.map(containerRef.current, {
        center: selected ?? DEFAULT_CENTER,
        zoom: selected ? 16 : 2,
        scrollWheelZoom: true,
      });
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      }).addTo(map);

      if (selected) {
        marker = L.circleMarker(selected, {
          radius: 9,
          color: "#1d4ed8",
          fillColor: "#3b82f6",
          fillOpacity: 0.9,
          weight: 2,
        }).addTo(map);
      }

      map.on("click", (event) => {
        const position: [number, number] = [
          event.latlng.lat,
          event.latlng.lng,
        ];
        if (marker) marker.setLatLng(position);
        else {
          marker = L.circleMarker(position, {
            radius: 9,
            color: "#1d4ed8",
            fillColor: "#3b82f6",
            fillOpacity: 0.9,
            weight: 2,
          }).addTo(map!);
        }
        markerRef.current = marker;
        onSelectRef.current(position[0], position[1]);
      });
      mapRef.current = map;
      markerRef.current = marker;
    }).catch((error: unknown) => {
      console.error("Unable to load the branch geofence map.", error);
    });

    return () => {
      cancelled = true;
      map?.remove();
      mapRef.current = null;
      markerRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || latitude == null || longitude == null) return;
    const point: [number, number] = [latitude, longitude];
    const marker = markerRef.current;
    if (marker) marker.setLatLng(point);
    else {
      import("leaflet").then((L) => {
        if (!mapRef.current || selectedRef.current == null) return;
        const current = L.circleMarker(point, {
          radius: 9,
          color: "#1d4ed8",
          fillColor: "#3b82f6",
          fillOpacity: 0.9,
          weight: 2,
        }).addTo(mapRef.current);
        markerRef.current = current;
      }).catch((error: unknown) => {
        console.error("Unable to update the branch geofence marker.", error);
      });
    }
    map.setView(point, Math.max(map.getZoom(), 16));
  }, [latitude, longitude]);

  return (
    <div
      ref={containerRef}
      aria-label="Branch geofence map. Click the map to choose the branch center."
      className="h-72 w-full rounded-md border border-border"
    />
  );
}
