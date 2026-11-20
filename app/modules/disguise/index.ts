import { requireNativeModule } from 'expo';

interface DisguiseNative {
  setAlias(id: string, all: string[]): void;
  currentAlias(all: string[]): string | null;
  pinShortcut(label: string, pngBase64: string | null): Promise<boolean>;
}

let native: DisguiseNative | null = null;
try {
  native = requireNativeModule<DisguiseNative>('Disguise');
} catch {
  native = null; // not available (for example when previewing outside the real app)
}

export const Disguise = {
  available: !!native,
  setAlias: (id: string, all: string[]) => native?.setAlias(id, all),
  currentAlias: (all: string[]) => native?.currentAlias(all) ?? null,
  pinShortcut: (label: string, png: string | null) => native?.pinShortcut(label, png) ?? Promise.resolve(false),
};
