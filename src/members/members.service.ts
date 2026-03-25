import { BadRequestException, Injectable } from '@nestjs/common';
import { MemberRole } from '@prisma/client';
import { randomBytes } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { InviteMemberDto } from './dto/invite-member.dto';
import { AcceptInvitationDto } from './dto/accept-invitation.dto';

@Injectable()
export class MembersService {
  constructor(private readonly prismaService: PrismaService) {}

  async listMembers(workspaceId: string) {
    const members = await this.prismaService.workspaceMember.findMany({
      where: { workspaceId },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            fullName: true,
            role: true,
            status: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return members.map((m) => ({
      workspaceMemberId: m.id,
      userId: m.userId,
      email: m.user.email,
      fullName: m.user.fullName,
      memberRole: m.role,
      status: m.status,
      joinedAt: m.createdAt,
    }));
  }

  async invite(workspaceId: string, dto: InviteMemberDto) {
    const token = randomBytes(24).toString('base64url');
    const expiredAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    const role = dto.role ?? MemberRole.MEMBER;

    return this.prismaService.workspaceInvitation.create({
      data: {
        workspaceId,
        inviteType: dto.inviteType,
        inviteValue: dto.inviteValue,
        role,
        status: 'PENDING',
        token,
        expiredAt,
      },
      select: {
        id: true,
        token: true,
        expiredAt: true,
        status: true,
        role: true,
        inviteType: true,
        inviteValue: true,
      },
    });
  }

  async removeMember(workspaceId: string, memberUserId: string) {
    // Prevent removing yourself accidentally: let FE handle UX.
    const member = await this.prismaService.workspaceMember.findUnique({
      where: { workspaceId_userId: { workspaceId, userId: memberUserId } },
      select: { id: true, role: true },
    });

    if (!member) {
      throw new BadRequestException('Member not found');
    }

    await this.prismaService.workspaceMember.delete({
      where: { workspaceId_userId: { workspaceId, userId: memberUserId } },
    });

    return { ok: true };
  }

  async acceptInvitation(
    workspaceId: string,
    userId: string,
    dto: AcceptInvitationDto,
  ) {
    const invitation = await this.prismaService.workspaceInvitation.findUnique({
      where: { token: dto.token },
      select: {
        id: true,
        workspaceId: true,
        status: true,
        expiredAt: true,
        role: true,
      },
    });

    if (!invitation) {
      throw new BadRequestException('Invitation not found');
    }

    if (invitation.workspaceId !== workspaceId) {
      throw new BadRequestException(
        'Invitation does not belong to this workspace',
      );
    }

    if (invitation.status !== 'PENDING') {
      throw new BadRequestException('Invitation is not available');
    }

    if (invitation.expiredAt.getTime() < Date.now()) {
      throw new BadRequestException('Invitation expired');
    }

    return this.prismaService.$transaction(async (tx) => {
      await tx.workspaceMember.upsert({
        where: { workspaceId_userId: { workspaceId, userId } },
        update: { role: invitation.role, status: 'ACTIVE' },
        create: {
          workspaceId,
          userId,
          role: invitation.role,
          status: 'ACTIVE',
        },
      });

      await tx.workspaceInvitation.update({
        where: { id: invitation.id },
        data: { status: 'ACCEPTED' },
      });

      return { ok: true };
    });
  }
}
