// Connects the call engine to the phone's real microphone, speaker and network (react-native-webrtc).
import { Disguise } from '../../modules/disguise';
import { requestRecordingPermissionsAsync } from 'expo-audio';
import { whileSystemUi } from './lockGuard';
import type { PcLike, RtcDeps } from './call';

// loaded only when a call starts, so the rest of the app (and the browser preview) never needs it
const rtc = () => require('react-native-webrtc') as any;

export const nativeRtc: RtcDeps = {
  async getMic() {
    const perm = await whileSystemUi(() => requestRecordingPermissionsAsync());
    if (!perm.granted) throw new Error('microphone not allowed');
    const stream = await rtc().mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }, video: false });
    (stream as any).__reva = true;
    return {
      setMuted: (m: boolean) => stream.getAudioTracks().forEach((t: any) => { t.enabled = !m; }),
      stop: () => stream.getTracks().forEach((t: any) => { try { t.stop(); } catch { /* stopped */ } }),
      stream,
    } as any;
  },

  createPc(servers, mic): PcLike {
    const { RTCPeerConnection, RTCSessionDescription, RTCIceCandidate } = rtc();
    const pc = new RTCPeerConnection({
      iceServers: servers.length ? servers : [{ urls: ['stun:stun.l.google.com:19302'] }], // no relay set up: Google's public helper finds addresses only
      bundlePolicy: 'max-bundle',
    });
    const stream = (mic as any).stream;
    stream.getAudioTracks().forEach((t: any) => pc.addTrack(t, stream));
    return {
      createOffer: async () => (await pc.createOffer({ offerToReceiveAudio: true, offerToReceiveVideo: false })).sdp,
      createAnswer: async () => (await pc.createAnswer()).sdp,
      setLocal: (type, sdp) => pc.setLocalDescription({ type, sdp }),
      setRemote: (type, sdp) => pc.setRemoteDescription(new RTCSessionDescription({ type, sdp })),
      addCandidate: (c) => pc.addIceCandidate(new RTCIceCandidate(JSON.parse(c))),
      onCandidate: (cb) => pc.addEventListener('icecandidate', (e: any) => { if (e.candidate) cb(JSON.stringify(e.candidate.toJSON ? e.candidate.toJSON() : e.candidate)); }),
      onState: (cb) => {
        const map = () => {
          const s = pc.connectionState ?? pc.iceConnectionState;
          if (s === 'connected' || s === 'completed') cb('connected');
          else if (s === 'disconnected') cb('disconnected');
          else if (s === 'failed') cb('failed');
          else if (s === 'closed') cb('closed');
          else cb('connecting');
        };
        pc.addEventListener('connectionstatechange', map);
        pc.addEventListener('iceconnectionstatechange', map);
      },
      close: () => { try { pc.close(); } catch { /* closed */ } },
    };
  },

  setSpeaker: (on) => Disguise.setSpeaker(on),
  audioSession: (on) => { Disguise.setCallAudio(on); Disguise.callService(on); },
};
