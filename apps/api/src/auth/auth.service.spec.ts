import { Test, TestingModule } from '@nestjs/testing';
import { AuthService } from './auth.service';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { UsersService } from '../users/users.service';
import { UnauthorizedException } from '@nestjs/common';
import * as crypto from 'crypto';

describe('AuthService', () => {
  let service: AuthService;
  let configService: ConfigService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        {
          provide: JwtService,
          useValue: { sign: jest.fn().mockReturnValue('mockJwt') },
        },
        {
          provide: ConfigService,
          useValue: { get: jest.fn().mockReturnValue('mockBotToken') },
        },
        {
          provide: UsersService,
          useValue: { createOrUpdateTelegramUser: jest.fn().mockResolvedValue({ id: '1', username: 'test' }) },
        },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
    configService = module.get<ConfigService>(ConfigService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('validateTelegramWebAppData', () => {
    it('should throw UnauthorizedException if hash is invalid', async () => {
      await expect(service.validateTelegramWebAppData('user={"id":123}&hash=invalidhash')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('should return user object if hash is valid', async () => {
      const token = 'mockBotToken';
      const userObj = { id: 123, first_name: 'Test' };
      const userStr = JSON.stringify(userObj);
      
      const dataCheckString = `user=${userStr}`;
      const secretKey = crypto.createHmac('sha256', 'WebAppData').update(token).digest();
      const validHash = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');
      
      const initData = `user=${userStr}&hash=${validHash}`;

      const result = await service.validateTelegramWebAppData(initData);
      expect(result).toEqual(userObj);
    });
  });
});
