const EARTH_RADIUS_KM = 6371.0088;

export interface Coordinates {
  latitude: number;
  longitude: number;
}

/**
 * Great-circle (straight-line) distance in km. Used for proximity filtering and radius-based
 * delivery eligibility only — never as a driving distance (MAPS_LOCATION_RULES §13).
 */
export function straightLineKm(a: Coordinates, b: Coordinates): number {
  const rad = (degrees: number) => (degrees * Math.PI) / 180;
  const dLat = rad(b.latitude - a.latitude);
  const dLng = rad(b.longitude - a.longitude);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(a.latitude)) * Math.cos(rad(b.latitude)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Lat/lng box containing every point within `km` of `center` (index-friendly prefilter). */
export function boundingBox(center: Coordinates, km: number) {
  const dLat = (km / EARTH_RADIUS_KM) * (180 / Math.PI);
  const cos = Math.cos((center.latitude * Math.PI) / 180);
  const dLng = cos < 1e-6 ? 180 : Math.min(180, dLat / cos);
  return {
    minLatitude: center.latitude - dLat,
    maxLatitude: center.latitude + dLat,
    minLongitude: center.longitude - dLng,
    maxLongitude: center.longitude + dLng,
  };
}
