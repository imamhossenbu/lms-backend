import { Global, Module } from "@nestjs/common";
import { MailService } from "../auth/mail/mail.service";
import { PrismaModule } from "../prisma/prisma.module";
import { PermissionsGuard } from "./permissions.guard";
import { TeamAccessService } from "./services/team-access.service";
import { TeamInvitesService } from "./services/team-invites.service";
import { TeamMembersService } from "./services/team-members.service";
import { TeamRolesService } from "./services/team-roles.service";
import { TeamInvitationsController } from "./team-invitations.controller";
import { TeamController } from "./team.controller";

/**
 * Team & Roles: staff RBAC for the admin panel.
 *   /team                      snapshot, members, invitations, roles (permission-checked)
 *   /team/me                   my effective permissions
 *   /team/invitations/accept   public invitation link
 * Global so any module can use @RequirePermission(module, action) (PermissionsGuard needs TeamAccessService).
 */
@Global()
@Module({
  imports: [PrismaModule],
  controllers: [TeamInvitationsController, TeamController],
  providers: [TeamAccessService, PermissionsGuard, TeamMembersService, TeamInvitesService, TeamRolesService, MailService],
  exports: [TeamAccessService, PermissionsGuard],
})
export class TeamModule {}
