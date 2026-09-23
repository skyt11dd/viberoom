import { VideoProvider } from './VideoProvider';

declare global {
  interface Window {
    YT: any;
    onYouTubeIframeAPIReady: () => void;
  }
}

export class YouTubeProvider implements VideoProvider {
  name = 'YouTube';
  private player: any = null;
  public onStateChange?: (state: { isPlaying: boolean; position: number }) => void;

  canHandle(url: string): boolean {
    return url.includes('youtube.com') || url.includes('youtu.be');
  }

  getVideoId(url: string): string | null {
    const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=)([^#&?]*).*/;
    const match = url.match(regExp);
    return match && match[2].length === 11 ? match[2] : null;
  }

  private loadIframeAPI(): Promise<void> {
    return new Promise((resolve) => {
      if (window.YT && window.YT.Player) {
        resolve();
        return;
      }

      if (!document.getElementById('youtube-iframe-api')) {
        const tag = document.createElement('script');
        tag.id = 'youtube-iframe-api';
        tag.src = 'https://www.youtube.com/iframe_api';
        const firstScriptTag = document.getElementsByTagName('script')[0];
        firstScriptTag.parentNode?.insertBefore(tag, firstScriptTag);
      }

      window.onYouTubeIframeAPIReady = () => {
        resolve();
      };
    });
  }

  async load(videoId: string, containerId: string): Promise<void> {
    await this.loadIframeAPI();

    return new Promise((resolve) => {
      this.player = new window.YT.Player(containerId, {
        height: '100%',
        width: '100%',
        videoId: videoId,
        playerVars: {
          autoplay: 0,
          controls: 1,
          disablekb: 1,
          modestbranding: 1,
          rel: 0,
        },
        events: {
          onReady: () => {
            resolve();
          },
          onStateChange: (event: any) => {
            if (!this.onStateChange) return;

            const isPlaying = event.data === window.YT.PlayerState.PLAYING;
            const position = this.player.getCurrentTime();

            if (
              event.data === window.YT.PlayerState.PLAYING ||
              event.data === window.YT.PlayerState.PAUSED
            ) {
              this.onStateChange({ isPlaying, position });
            }
          },
        },
      });
    });
  }

  async play(): Promise<void> {
    if (this.player && this.player.playVideo) {
      this.player.playVideo();
    }
  }

  async pause(): Promise<void> {
    if (this.player && this.player.pauseVideo) {
      this.player.pauseVideo();
    }
  }

  async seek(position: number): Promise<void> {
    if (this.player && this.player.seekTo) {
      this.player.seekTo(position, true);
    }
  }

  async getCurrentTime(): Promise<number> {
    if (this.player && this.player.getCurrentTime) {
      return this.player.getCurrentTime();
    }
    return 0;
  }

  destroy(): void {
    if (this.player && this.player.destroy) {
      this.player.destroy();
      this.player = null;
    }
  }
}
