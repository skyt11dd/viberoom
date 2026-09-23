import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Body,
  UseGuards,
  Request,
} from '@nestjs/common';
import { FriendsService } from './friends.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@UseGuards(JwtAuthGuard)
@Controller('friends')
export class FriendsController {
  constructor(private readonly friendsService: FriendsService) {}

  @Get()
  getFriends(@Request() req: any) {
    return this.friendsService.getFriends(req.user.id);
  }

  @Post(':id')
  addFriend(@Request() req: any, @Param('id') targetUserId: string) {
    return this.friendsService.addFriend(req.user.id, targetUserId);
  }

  @Delete(':id')
  removeFriend(@Request() req: any, @Param('id') targetUserId: string) {
    return this.friendsService.removeFriend(req.user.id, targetUserId);
  }

  @Post(':id/invite')
  inviteFriend(
    @Request() req: any,
    @Param('id') targetUserId: string,
    @Body('roomId') roomId: string,
  ) {
    return this.friendsService.inviteFriendToRoom(req.user.id, targetUserId, roomId);
  }
}
