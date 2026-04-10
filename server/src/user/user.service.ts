import { Injectable, NotFoundException, ConflictException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateUserDto, UpdateUserDto } from './dto/user.dto';
import * as bcrypt from 'bcryptjs';

@Injectable()
export class UserService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(page = 1, limit = 20, search?: string) {
    const skip = (page - 1) * limit;
    const where = search
      ? {
          OR: [
            { email: { contains: search, mode: 'insensitive' as const } },
            { first_name: { contains: search, mode: 'insensitive' as const } },
            { last_name: { contains: search, mode: 'insensitive' as const } },
          ],
        }
      : {};

    const [users, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        skip,
        take: limit,
        orderBy: { created_at: 'desc' },
        select: {
          id: true,
          email: true,
          first_name: true,
          last_name: true,
          avatar_url: true,
          provider: true,
          role: true,
          is_active: true,
          created_at: true,
          updated_at: true,
        },
      }),
      this.prisma.user.count({ where }),
    ]);

    return { users, total, page, limit };
  }

  async findOne(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        email: true,
        first_name: true,
        last_name: true,
        avatar_url: true,
        provider: true,
        provider_id: true,
        role: true,
        is_active: true,
        created_at: true,
        updated_at: true,
      },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return user;
  }

  async create(createUserDto: CreateUserDto) {
    const existingUser = await this.prisma.user.findUnique({
      where: { email: createUserDto.email },
    });

    if (existingUser) {
      throw new ConflictException('User with this email already exists');
    }

    const hashedPassword = await bcrypt.hash(createUserDto.password, 10);

    return this.prisma.user.create({
      data: {
        email: createUserDto.email,
        password: hashedPassword,
        first_name: createUserDto.first_name,
        last_name: createUserDto.last_name,
        provider: 'local',
        role: createUserDto.role || 'user',
      },
      select: {
        id: true,
        email: true,
        first_name: true,
        last_name: true,
        provider: true,
        role: true,
        is_active: true,
        created_at: true,
      },
    });
  }

  async update(id: string, updateUserDto: UpdateUserDto) {
    // Check if user exists
    const existingUser = await this.prisma.user.findUnique({ where: { id } });
    if (!existingUser) {
      throw new NotFoundException('User not found');
    }

    // If email is being changed, check for duplicates
    if (updateUserDto.email && updateUserDto.email !== existingUser.email) {
      const duplicate = await this.prisma.user.findUnique({
        where: { email: updateUserDto.email },
      });
      if (duplicate) {
        throw new ConflictException('User with this email already exists');
      }
    }

    // Hash password if provided
    const data: any = { ...updateUserDto };
    if (updateUserDto.password) {
      data.password = await bcrypt.hash(updateUserDto.password, 10);
    }

    return this.prisma.user.update({
      where: { id },
      data,
      select: {
        id: true,
        email: true,
        first_name: true,
        last_name: true,
        avatar_url: true,
        provider: true,
        role: true,
        is_active: true,
        updated_at: true,
      },
    });
  }

  async remove(id: string) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    // Don't allow deleting the last admin user
    const adminCount = await this.prisma.user.count({ where: { is_active: true } });
    if (adminCount <= 1 && user.is_active) {
      throw new BadRequestException('Cannot delete the last active user');
    }

    return this.prisma.user.delete({
      where: { id },
      select: { id: true, email: true },
    });
  }
}
