export interface VideoProvider {
  name: string;
  canHandle(url: string): boolean;
  getVideoId(url: string): string | null;
  load(videoId: string, containerId: string): Promise<void>;
  play(): Promise<void>;
  pause(): Promise<void>;
  seek(position: number): Promise<void>;
  getCurrentTime(): Promise<number>;
  destroy(): void;
  onStateChange?: (state: { isPlaying: boolean; position: number }) => void;
}
