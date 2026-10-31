import {readFileSync, writeFileSync} from 'node:fs';
const manifest = 'android/app/src/main/AndroidManifest.xml';
let xml = readFileSync(manifest, 'utf8');
xml = xml.replace('android:allowBackup="true"', 'android:allowBackup="false"');
if (!xml.includes('android.permission.ACCESS_FINE_LOCATION')) {
  xml = xml.replace('</manifest>', '    <uses-permission android:name="android.permission.ACCESS_COARSE_LOCATION" />\n    <uses-permission android:name="android.permission.ACCESS_FINE_LOCATION" />\n    <uses-feature android:name="android.hardware.location.gps" android:required="false" />\n</manifest>');
}
writeFileSync(manifest, xml);
