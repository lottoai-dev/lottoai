/**
 * Dynamic Expo config.
 * On EAS Build, GOOGLE_SERVICES_JSON is a file-type env var whose value is
 * the absolute path to the injected google-services.json on the builder.
 * Locally, fall back to the gitignored file in the project root.
 */
module.exports = ({ config }) => ({
  ...config,
  android: {
    ...config.android,
    googleServicesFile:
      process.env.GOOGLE_SERVICES_JSON ?? "./google-services.json",
  },
});
