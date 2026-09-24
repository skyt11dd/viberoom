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

  @Get('requests')
  getFriendRequests(@Request() req: any) {
    return this.friendsService.getFriendRequests(req.user.id);
  }

  @Get('status/:id')
  getFriendshipStatus(@Request() req: any, @Param('id') targetUserId: string) {
    return this.friendsService.getFriendshipStatus(req.user.id, targetUserId);
  }

  @Post('request/:id')
  sendFriendRequest(@Request() req: any, @Param('id') targetUserId: string) {
    return this.friendsService.sendFriendRequest(req.user.id, targetUserId);
  }

  @Post('requests/:id/accept')
  acceptFriendRequest(@Request() req: any, @Param('id') requestId: string) {
    return this.friendsService.acceptFriendRequest(req.user.id, requestId);
  }

  @Post('requests/:id/decline')
  declineFriendRequest(@Request() req: any, @Param('id') requestId: string) {
    return this.friendsService.declineFriendRequest(req.user.id, requestId);
  }

  @Post('requests/:id/cancel')
  cancelFriendRequest(@Request() req: any, @Param('id') requestId: string) {
    return this.friendsService.cancelFriendRequest(req.user.id, requestId);
  }

  // Backward compatible route for adding friend: calls sendFriendRequest
  @Post(':id')
  addFriend(@Request() req: any, @Param('id') targetUserId: string) {
    return this.friendsService.sendFriendRequest(req.user.id, targetUserId);
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
