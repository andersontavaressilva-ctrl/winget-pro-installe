// Ajusta o projeto Android gerado pelo Capacitor para também aparecer e funcionar no Android TV:
//  - categoria LEANBACK_LAUNCHER (ícone na tela inicial da TV)
//  - tela sensível ao toque e leanback como recursos opcionais (um único APK para celular e TV)
//  - banner da TV
//  - tráfego http liberado (muitas listas IPTV ainda usam http)
const fs = require('fs');
const path = require('path');

const manifestPath = path.join(__dirname, '..', 'android', 'app', 'src', 'main', 'AndroidManifest.xml');
if (!fs.existsSync(manifestPath)) {
  console.error('AndroidManifest.xml não encontrado. Rode primeiro: npm run android:init');
  process.exit(1);
}

let xml = fs.readFileSync(manifestPath, 'utf8');
const original = xml;

if (!xml.includes('android.software.leanback')) {
  xml = xml.replace(/<application/, [
    '<uses-feature android:name="android.software.leanback" android:required="false" />',
    '    <uses-feature android:name="android.hardware.touchscreen" android:required="false" />',
    '    <application',
  ].join('\n'));
}

if (!xml.includes('android:banner=')) {
  xml = xml.replace(/<application/, '<application\n        android:banner="@mipmap/ic_launcher"');
}

if (!xml.includes('android:usesCleartextTraffic')) {
  xml = xml.replace(/<application/, '<application\n        android:usesCleartextTraffic="true"');
}

if (!xml.includes('android.intent.category.LEANBACK_LAUNCHER')) {
  xml = xml.replace(
    /(<category android:name="android.intent.category.LAUNCHER"\s*\/>)/,
    '$1\n                <category android:name="android.intent.category.LEANBACK_LAUNCHER" />'
  );
}

if (xml !== original) {
  fs.writeFileSync(manifestPath, xml);
  console.log('AndroidManifest.xml ajustado para Android TV.');
} else {
  console.log('AndroidManifest.xml já estava ajustado.');
}
