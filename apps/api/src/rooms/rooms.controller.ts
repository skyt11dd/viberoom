import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Delete,
  UseGuards,
  Request,
} from '@nestjs/common';
import { RoomsService } from './rooms.service';
import { CreateRoomDto } from './dto/create-room.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@UseGuards(JwtAuthGuard)
@Controller('rooms')
export class RoomsController {
  constructor(private readonly roomsService: RoomsService) {}

  @Get()
  findAll() {
    return this.roomsService.findAllActive();
  }

  @Get('stats/me')
  getStats(@Request() req: any) {
    return this.roomsService.getUserStats(req.user.id);
  }

  @Post()
  create(@Request() req: any, @Body() createRoomDto: CreateRoomDto) {
    return this.roomsService.create(req.user.id, createRoomDto);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.roomsService.findOne(id);
  }

  @Delete(':id')
  remove(@Request() req: any, @Param('id') id: string) {
    return this.roomsService.remove(req.user.id, id);
  }

  @Post(':id/join')
  joinRoom(@Request() req: any, @Param('id') id: string) {
    return this.roomsService.joinRoom(req.user.id, id);
  }

  @Post(':id/leave')
  leaveRoom(@Request() req: any, @Param('id') id: string) {
    return this.roomsService.leaveRoom(req.user.id, id);
  }

  @Get(':id/members')
  getMembers(@Param('id') id: string) {
    return this.roomsService.getMembers(id);
  }
}
