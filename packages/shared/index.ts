export interface PlaybackState {
  provider: string;
  videoId: string;
  position: number;
  isPlaying: boolean;
  serverTimestamp: number;
}
