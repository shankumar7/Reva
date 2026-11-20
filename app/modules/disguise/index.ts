import { requireNativeModule } from 'expo';

interface DisguiseNative {
  setAlias(id: string, all: string[]): void;
  currentAlias(all: string[]): string | null;
  pinShortcut(label: string, pngBase64: string | null): Promise<boolean>;
  saveImageToGallery(path: string, displayName: string): Promise<boolean>;
  setCallAudio(on: boolean): void;
  hideRecents(hide: boolean): void;
  callService(on: boolean): void;
  setSpeaker(on: boolean): void;
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
  setCallAudio: (on: boolean) => native?.setCallAudio(on),
  callService: (on: boolean) => { try { native?.callService(on); } catch { /* could not start: the call still works while the app is open */ } },
  hideRecents: (hide: boolean) => { try { native?.hideRecents(hide); } catch { /* older module */ } },
  setSpeaker: (on: boolean) => native?.setSpeaker(on),
  saveImage: (path: string, name: string) => native?.saveImageToGallery(path, name) ?? Promise.resolve(false),
};
