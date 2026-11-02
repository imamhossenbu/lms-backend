import { Body, Controller, Get, HttpCode, Post, Query } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import { ValidateDto } from "../common/auth-user";
import { AcceptInviteDto, InviteTokenQueryDto } from "./dto/team.dto";
import { TeamInvitesService } from "./services/team-invites.service";

/** Public: the link in an invitation email (no login yet). Throttled against token guessing. */
@ApiTags("Team")
@Controller("team/invitations/accept")
@ValidateDto()
@Throttle({ default: { limit: 20, ttl: 60_000 } })
export class TeamInvitationsController {
  constructor(private readonly invites: TeamInvitesService) {}

  @Get()
  @ApiOperation({ summary: "Invitation details for the accept page (workspace, role, inviter, expiry)" })
  preview(@Query() q: InviteTokenQueryDto) {
    return this.invites.preview(q.token);
  }

  @Post()
  @HttpCode(200)
  @ApiOperation({ summary: "Accept: set name + password, join the team, then sign in" })
  accept(@Body() dto: AcceptInviteDto) {
    return this.invites.accept(dto);
  }
}
