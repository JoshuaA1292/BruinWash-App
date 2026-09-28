// Learn more: https://docs.expo.dev/guides/customizing-metro/
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

/**
 * @stripe/stripe-react-native is native-only: it imports
 * react-native/Libraries/Utilities/codegenNativeComponent, which does not exist
 * on web. Metro resolves imports statically, so a try/catch around require()
 * cannot prevent the bundle from failing — the module has to be stubbed out at
 * resolution time.
 *
 * src/lib/stripe.ts treats a module with no useStripe as unavailable, so web
 * falls through to checkout's preview path.
 */
const previousResolveRequest = config.resolver.resolveRequest;

config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (platform === 'web' && moduleName.startsWith('@stripe/stripe-react-native')) {
    return { type: 'empty' };
  }
  return previousResolveRequest
    ? previousResolveRequest(context, moduleName, platform)
    : context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
