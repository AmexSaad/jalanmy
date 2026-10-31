export const TTL = 60 * 60 * 1000;
export const categories = ['Roadblock', 'Speed trap', 'Kemalangan', 'Banjir', 'Jalan tutup', 'Halangan'];
// Broad prototype coverage box, not an administrative boundary.
export function inCoverage(lon, lat) {
  return Number.isFinite(lon) && Number.isFinite(lat) && lon >= 102.35 && lon <= 104.6 && lat >= 1.15 && lat <= 2.95;
}
export function activeReports(rows, now = Date.now()) {
  if (!Array.isArray(rows)) return [];
  return rows.filter(r => r && typeof r.id === 'string' && categories.includes(r.category) && inCoverage(r.lon, r.lat) && Number.isFinite(r.createdAt) && r.createdAt <= now && now - r.createdAt < TTL);
}
export function gpsSpeed(speed) {
  return Number.isFinite(speed) && speed >= 0 ? Math.round(speed * 3.6) : null;
}
export function decodePolyline(encoded, precision = 6) {
  const coordinates = []; let index = 0, lat = 0, lon = 0;
  const read = () => {
    let result = 0, shift = 0, byte;
    do {
      if (index >= encoded.length || shift > 30) throw new Error('Invalid route geometry');
      byte = encoded.charCodeAt(index++) - 63;
      if (byte < 0 || byte > 63) throw new Error('Invalid route geometry');
      result |= (byte & 31) << shift; shift += 5;
    } while (byte >= 32);
    return result & 1 ? ~(result >> 1) : result >> 1;
  };
  while (index < encoded.length) { lat += read(); lon += read(); coordinates.push([lon / 10 ** precision, lat / 10 ** precision]); }
  return coordinates;
}
