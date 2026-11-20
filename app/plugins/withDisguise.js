// Turns config/disguises.js into Android launcher aliases (name + icon each),
// and removes the normal launcher entry so only the active disguise shows.
const fs = require('fs');
const path = require('path');
const { withAndroidManifest, withDangerousMod } = require('@expo/config-plugins');
const disguises = require('../config/disguises.js');

const lower = (id) => 'ic_d_' + id.toLowerCase();

function vectorXml(parts) {
  const body = parts
    .map((p) => {
      const a = [`android:pathData="${p.d}"`];
      if (p.fill) a.push(`android:fillColor="${p.fill}"`);
      if (p.stroke) a.push(`android:strokeColor="${p.stroke}"`, `android:strokeWidth="${p.strokeWidth || 4}"`);
      if (p.cap) a.push(`android:strokeLineCap="${p.cap}"`, 'android:strokeLineJoin="round"');
      return `  <path ${a.join(' ')}/>`;
    })
    .join('\n');
  return `<vector xmlns:android="http://schemas.android.com/apk/res/android" android:width="108dp" android:height="108dp" android:viewportWidth="108" android:viewportHeight="108">\n${body}\n</vector>\n`;
}

const withResources = (config) =>
  withDangerousMod(config, [
    'android',
    async (cfg) => {
      const res = path.join(cfg.modRequest.platformProjectRoot, 'app/src/main/res');
      fs.mkdirSync(path.join(res, 'drawable'), { recursive: true });
      fs.mkdirSync(path.join(res, 'mipmap-anydpi-v26'), { recursive: true });
      fs.mkdirSync(path.join(res, 'values'), { recursive: true });
      let colors = '<?xml version="1.0" encoding="utf-8"?>\n<resources>\n';
      for (const d of disguises) {
        const n = lower(d.id);
        fs.writeFileSync(path.join(res, 'drawable', n + '_fg.xml'), vectorXml(d.glyph));
        colors += `  <color name="${n}_bg">${d.bg}</color>\n`;
        fs.writeFileSync(
          path.join(res, 'mipmap-anydpi-v26', n + '.xml'),
          `<?xml version="1.0" encoding="utf-8"?>\n<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">\n  <background android:drawable="@color/${n}_bg"/>\n  <foreground android:drawable="@drawable/${n}_fg"/>\n</adaptive-icon>\n`,
        );
      }
      colors += '</resources>\n';
      fs.writeFileSync(path.join(res, 'values', 'disguise_colors.xml'), colors);
      return cfg;
    },
  ]);

const withAliases = (config) =>
  withAndroidManifest(config, (cfg) => {
    const app = cfg.modResults.manifest.application[0];
    const main = app.activity.find((a) => a.$['android:name'] === '.MainActivity');
    // drop the normal launcher entry
    main['intent-filter'] = (main['intent-filter'] || []).filter(
      (f) => !(f.category || []).some((c) => c.$['android:name'] === 'android.intent.category.LAUNCHER'),
    );
    app['activity-alias'] = disguises.map((d, i) => ({
      $: {
        'android:name': '.alias.' + d.id,
        'android:targetActivity': '.MainActivity',
        'android:enabled': i === 0 ? 'true' : 'false',
        'android:exported': 'true',
        'android:label': d.label,
        'android:icon': '@mipmap/' + lower(d.id),
        'android:roundIcon': '@mipmap/' + lower(d.id),
      },
      'intent-filter': [
        {
          action: [{ $: { 'android:name': 'android.intent.action.MAIN' } }],
          category: [{ $: { 'android:name': 'android.intent.category.LAUNCHER' } }],
        },
      ],
    }));
    return cfg;
  });

module.exports = (config) => withAliases(withResources(config));
