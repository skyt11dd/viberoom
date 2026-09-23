import { Injectable } from '@nestjs/common';
import { RedisService } from '../redis/redis.service';
import { PlaybackState } from '@viberoom/shared';

@Injectable()
export class EventsService {
  constructor(private redisService: RedisService) {}

  private getRoomStateKey(roomId: string) {
    return `room:${roomId}:state`;
  }

  async setPlaybackState(roomId: string, state: PlaybackState) {
    await this.redisService.client.set(this.getRoomStateKey(roomId), JSON.stringify(state));
  }

  async getPlaybackState(roomId: string): Promise<PlaybackState | null> {
    const data = await this.redisService.client.get(this.getRoomStateKey(roomId));
    if (!data) return null;
    try {
      return JSON.parse(data) as PlaybackState;
    } catch {
      return null;
    }
  }

  async clearPlaybackState(roomId: string) {
    await this.redisService.client.del(this.getRoomStateKey(roomId));
  }
}
