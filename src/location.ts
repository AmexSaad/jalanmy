import { Capacitor } from '@capacitor/core';
import { Geolocation } from '@capacitor/geolocation';
export async function startLocation(onPosition: (p: {coords: {longitude: number; latitude: number; speed: number | null; accuracy: number}}) => void, onError: () => void): Promise<() => void> {
  if (Capacitor.isNativePlatform()) {
    const permission = await Geolocation.requestPermissions({permissions: ['location']});
    if (permission.location !== 'granted' && permission.coarseLocation !== 'granted') throw new Error('Location denied');
    const id = await Geolocation.watchPosition({enableHighAccuracy: true, timeout: 15000, maximumAge: 5000, minimumUpdateInterval: 2000}, (p, error) => { if (error || !p) onError(); else onPosition(p); });
    return () => { void Geolocation.clearWatch({id}); };
  }
  const id = navigator.geolocation.watchPosition(onPosition, onError, {enableHighAccuracy: true, maximumAge: 5000, timeout: 15000});
  return () => navigator.geolocation.clearWatch(id);
}
