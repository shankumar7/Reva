import { registerRootComponent } from 'expo';

// EXPO_PUBLIC_PREVIEW is only set when making the browser preview used for checking the design.
// The check below is replaced by a constant at build time, so the real app never contains the preview code.
const Root = process.env.EXPO_PUBLIC_PREVIEW === '1' ? require('./preview/Preview').default : require('./App').default;

registerRootComponent(Root);
