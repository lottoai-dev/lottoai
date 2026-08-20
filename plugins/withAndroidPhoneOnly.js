// plugins/withAndroidPhoneOnly.js
// AndroidManifest'e supports-screens ekler: large/xlarge kapalı → Play'de
// tablet dağıtımı filtrelenir (iOS'taki supportsTablet: false ile hizalı).
// Prebuild / EAS native build sırasında uygulanır.

const { withAndroidManifest } = require('expo/config-plugins');

function setSupportsScreensPhoneOnly(androidManifest) {
  const { manifest } = androidManifest;

  manifest['supports-screens'] = [
    {
      $: {
        'android:smallScreens': 'true',
        'android:normalScreens': 'true',
        'android:largeScreens': 'false',
        'android:xlargeScreens': 'false',
      },
    },
  ];

  return androidManifest;
}

function withAndroidPhoneOnly(config) {
  return withAndroidManifest(config, (config) => {
    config.modResults = setSupportsScreensPhoneOnly(config.modResults);
    return config;
  });
}

module.exports = withAndroidPhoneOnly;
