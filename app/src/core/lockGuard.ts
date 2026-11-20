// Android treats the photo picker, camera, file picker and share sheet as "leaving the app". Without this,
// opening any of them would lock the app and throw you out of the chat. While one is open the lock waits.
let busy = 0;

export const lockGuard = {
  get active() {
    return busy > 0;
  },
};

export async function whileSystemUi<T>(fn: () => Promise<T>): Promise<T> {
  busy++;
  try {
    return await fn();
  } finally {
    // the "back in the app" event can arrive a moment after the picker closes
    setTimeout(() => { busy--; }, 2500);
  }
}
