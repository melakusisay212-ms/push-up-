// Adds the permissions this app needs to the generated Android manifest. Safe to run repeatedly.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
const path = 'android/app/src/main/AndroidManifest.xml';
if (!existsSync(path)) { console.error(`${path} not found. Run "npx cap add android" first.`); process.exit(1); }
let xml = readFileSync(path, 'utf8');
const wanted = ['android.permission.POST_NOTIFICATIONS', 'android.permission.RECEIVE_BOOT_COMPLETED'];
for (const p of wanted) {
  if (xml.includes(`android:name="${p}"`)) continue;
  xml = xml.replace('</manifest>', `    <uses-permission android:name="${p}" />\n</manifest>`);
  console.log(`added ${p}`);
}
writeFileSync(path, xml);
