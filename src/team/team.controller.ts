import { Body, Controller, createParamDecorator, Delete, ExecutionContext, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Put } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import { CurrentUser, RequireRoles, ValidateDto, type AuthUser } from "../common/auth-user";
import { ExtraPermissionsDto, InviteMembersDto, RemindTwoFactorDto, RoleDto, UpdateMemberDto } from "./dto/team.dto";
import { RequirePermission } from "./permissions.guard";
import { STAFF_ROLE, TeamAccessService, type ActorContext } from "./services/team-access.service";
import { TeamInvitesService } from "./services/team-invites.service";
import { TeamMembersService } from "./services/team-members.service";
import { TeamRolesService } from "./services/team-roles.service";

/** The staff context resolved by PermissionsGuard (only on endpoints with @RequirePermission). */
const TeamActor = createParamDecorator((_: unknown, ctx: ExecutionContext): ActorContext => ctx.switchToHttp().getRequest().teamAccess);
const Id = (name = "id") => Param(name, new ParseUUIDPipe({ errorHttpStatusCode: 404 }));

/** Admin panel › Team & Roles (/users in the panel). */
@ApiTags("Team")
@Controller("team")
@RequireRoles(STAFF_ROLE)
@ValidateDto()
export class TeamController {
  constructor(
    private readonly access: TeamAccessService,
    private readonly members: TeamMembersService,
    private readonly invites: TeamInvitesService,
    private readonly roles: TeamRolesService,
  ) {}

  @Get("me")
  @ApiOperation({ summary: "My role and effective permissions (for showing / hiding panel features)" })
  me(@CurrentUser() user: AuthUser) {
    return this.access.myAccess(user);
  }

  @Get()
  @RequirePermission("team", "view")
  @ApiOperation({ summary: "Members, roles and recent activity — same shape as the panel's TeamSeed" })
  snapshot(@TeamActor() ctx: ActorContext) {
    return this.members.snapshot(ctx);
  }

  // ---------------------------------------------------------------- members

  @Get("members/:id")
  @RequirePermission("team", "view")
  member(@TeamActor() ctx: ActorContext, @Id() id: string) {
    return this.members.get(ctx, id);
  }

  @Patch("members/:id")
  @RequirePermission("team", "manage")
  @ApiOperation({ summary: "Change role and/or suspend / reactivate" })
  updateMember(@TeamActor() ctx: ActorContext, @Id() id: string, @Body() dto: UpdateMemberDto) {
    return this.members.update(ctx, id, dto);
  }

  @Put("members/:id/extra-permissions")
  @RequirePermission("team", "manage")
  setExtras(@TeamActor() ctx: ActorContext, @Id() id: string, @Body() dto: ExtraPermissionsDto) {
    return this.members.setExtraPermissions(ctx, id, dto.extraPermissions);
  }

  @Post("members/:id/reset-2fa")
  @HttpCode(200)
  @RequirePermission("team", "manage")
  resetTwoFactor(@TeamActor() ctx: ActorContext, @Id() id: string) {
    return this.members.resetTwoFactor(ctx, id);
  }

  @Post("2fa-reminders")
  @HttpCode(200)
  @RequirePermission("team", "manage")
  remindTwoFactor(@TeamActor() ctx: ActorContext, @Body() dto: RemindTwoFactorDto) {
    return this.members.remindTwoFactor(ctx, dto.memberIds);
  }

  @Delete("members/:id")
  @RequirePermission("team", "delete")
  @ApiOperation({ summary: "Remove a member (account deactivated) or cancel an invitation" })
  removeMember(@TeamActor() ctx: ActorContext, @Id() id: string) {
    return this.members.remove(ctx, id);
  }

  // ---------------------------------------------------------------- invitations

  @Post("invitations")
  @RequirePermission("team", "manage")
  @ApiOperation({ summary: "Invite people to a role (optionally with extra permissions)" })
  invite(@TeamActor() ctx: ActorContext, @Body() dto: InviteMembersDto) {
    return this.invites.invite(ctx, dto);
  }

  @Post("invitations/:id/resend")
  @HttpCode(200)
  @RequirePermission("team", "manage")
  resend(@TeamActor() ctx: ActorContext, @Id() id: string) {
    return this.invites.resend(ctx, id);
  }

  @Delete("invitations/:id")
  @RequirePermission("team", "manage")
  revoke(@TeamActor() ctx: ActorContext, @Id() id: string) {
    return this.invites.revoke(ctx, id);
  }

  // ---------------------------------------------------------------- roles

  @Get("roles/:id")
  @RequirePermission("team", "view")
  role(@TeamActor() ctx: ActorContext, @Id() id: string) {
    return this.roles.get(ctx, id);
  }

  @Post("roles")
  @RequirePermission("team", "manage")
  createRole(@TeamActor() ctx: ActorContext, @Body() dto: RoleDto) {
    return this.roles.create(ctx, dto);
  }

  @Put("roles/:id")
  @RequirePermission("team", "manage")
  updateRole(@TeamActor() ctx: ActorContext, @Id() id: string, @Body() dto: RoleDto) {
    return this.roles.update(ctx, id, dto);
  }

  @Post("roles/:id/reset")
  @HttpCode(200)
  @RequirePermission("team", "manage")
  @ApiOperation({ summary: "Restore a built-in role's default permissions" })
  resetRole(@TeamActor() ctx: ActorContext, @Id() id: string) {
    return this.roles.resetToDefault(ctx, id);
  }

  @Post("roles/:id/duplicate")
  @RequirePermission("team", "manage")
  duplicateRole(@TeamActor() ctx: ActorContext, @Id() id: string) {
    return this.roles.duplicate(ctx, id);
  }

  @Delete("roles/:id")
  @RequirePermission("team", "delete")
  deleteRole(@TeamActor() ctx: ActorContext, @Id() id: string) {
    return this.roles.remove(ctx, id);
  }
}
