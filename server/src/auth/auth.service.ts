import { Injectable, ConflictException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service';
import { RegisterDto, LoginDto } from './dto/auth.dto';
import * as bcrypt from 'bcryptjs';
import type { User } from '@prisma/client';

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
  ) {}

  async register(registerDto: RegisterDto) {
    // Check if user already exists
    const existingUser = await this.prisma.user.findUnique({
      where: { email: registerDto.email },
    });

    if (existingUser) {
      throw new ConflictException('User with this email already exists');
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(registerDto.password, 10);

    // Create user
    const user = await this.prisma.user.create({
      data: {
        email: registerDto.email,
        password: hashedPassword,
        first_name: registerDto.first_name,
        last_name: registerDto.last_name,
        provider: 'local',
      },
    });

    // Generate JWT token
    const payload = { sub: user.id, email: user.email, role: user.role };
    const token = this.jwtService.sign(payload);

    return {
      access_token: token,
      user: {
        id: user.id,
        email: user.email,
        first_name: user.first_name,
        last_name: user.last_name,
        provider: user.provider,
        role: user.role,
      },
    };
  }

  async login(loginDto: LoginDto) {
    const user = await this.validateUser(loginDto.email, loginDto.password);
    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const payload = { sub: user.id, email: user.email, role: user.role };
    const token = this.jwtService.sign(payload);

    return {
      access_token: token,
      user: {
        id: user.id,
        email: user.email,
        first_name: user.first_name,
        last_name: user.last_name,
        provider: user.provider,
        role: user.role,
      },
    };
  }

  async validateUser(email: string, password: string): Promise<Omit<User, 'password'> | null> {
    const user = await this.prisma.user.findUnique({
      where: { email },
    });

    if (user && user.password && await bcrypt.compare(password, user.password)) {
      const { password, ...result } = user;
      return result;
    }

    return null;
  }

  async validateOAuthLogin(
    provider: string,
    profile: {
      providerId: string;
      email?: string;
      firstName?: string;
      lastName?: string;
      avatarUrl?: string;
    },
  ): Promise<Omit<User, 'password'>> {
    // Try to find existing user by provider_id
    let user = await this.prisma.user.findUnique({
      where: { provider_id: profile.providerId },
    });

    if (user) {
      // User exists, return without password
      const { password, ...result } = user;
      return result;
    }

    // Try to find user by email
    if (profile.email) {
      user = await this.prisma.user.findUnique({
        where: { email: profile.email },
      });

      if (user) {
        // Update with provider info
        user = await this.prisma.user.update({
          where: { id: user.id },
          data: {
            provider: provider,
            provider_id: profile.providerId,
          },
        });
        const { password, ...result } = user;
        return result;
      }
    }

    // Create new user
    user = await this.prisma.user.create({
      data: {
        email: profile.email || `${profile.providerId}@${provider}.local`,
        password: null,
        first_name: profile.firstName,
        last_name: profile.lastName,
        avatar_url: profile.avatarUrl,
        provider: provider,
        provider_id: profile.providerId,
      },
    });

    const { password, ...result } = user;
    return result;
  }

  async generateTokens(user: any) {
    const payload = { sub: user.id, email: user.email, role: user.role };
    return {
      access_token: this.jwtService.sign(payload),
    };
  }
}
