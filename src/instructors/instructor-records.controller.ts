import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Query } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import { CurrentUser, RequireRoles, ValidateDto, type AuthUser } from "../common/auth-user";
import { InstructorNoteDto, InstructorStudentsQueryDto, ScheduleQueryDto } from "./dto/instructor.dto";
import { InstructorId } from "./instructors.controller";
import { INSTRUCTOR_MANAGER_ROLES } from "./instructors.constants";
import { InstructorNotesService } from "./services/instructor-notes.service";
import { InstructorRecordsService } from "./services/instructor-records.service";
import { InstructorStatsService } from "./services/instructor-stats.service";
import { InstructorsService } from "./services/instructors.service";

const NoteId = () => Param("noteId", new ParseUUIDPipe({ errorHttpStatusCode: 404 }));

/** Admin panel › Instructor details tabs: courses, students, reviews, schedule, activity log, notes. */
@ApiTags("Instructors")
@Controller("instructors/:id")
@RequireRoles(...INSTRUCTOR_MANAGER_ROLES)
@ValidateDto()
export class InstructorRecordsController {
  constructor(
    private readonly instructors: InstructorsService,
    private readonly stats: InstructorStatsService,
    private readonly records: InstructorRecordsService,
    private readonly notes: InstructorNotesService,
  ) {}

  @Get("courses")
  @ApiOperation({ summary: "Courses taught, with students, rating and revenue" })
  async courses(@CurrentUser() user: AuthUser, @InstructorId() id: string) {
    await this.instructors.mustFind(user, id);
    return this.stats.courses(id);
  }

  @Get("students")
  @ApiOperation({ summary: "Enrollments in the instructor's courses (paginated)" })
  async students(@CurrentUser() user: AuthUser, @InstructorId() id: string, @Query() query: InstructorStudentsQueryDto) {
    await this.instructors.mustFind(user, id);
    return this.records.students(id, query);
  }

  @Get("reviews")
  @ApiOperation({ summary: "Reviews on the instructor's courses + rating summary" })
  async reviews(@CurrentUser() user: AuthUser, @InstructorId() id: string) {
    await this.instructors.mustFind(user, id);
    return this.records.reviews(id);
  }

  @Get("schedule")
  @ApiOperation({ summary: "Live classes and assignment deadlines in a date range" })
  async schedule(@CurrentUser() user: AuthUser, @InstructorId() id: string, @Query() query: ScheduleQueryDto) {
    await this.instructors.mustFind(user, id);
    return this.records.schedule(id, query);
  }

  @Get("activity")
  @ApiOperation({ summary: "Activity log, newest first" })
  async activity(@CurrentUser() user: AuthUser, @InstructorId() id: string) {
    await this.instructors.mustFind(user, id);
    return this.records.activity(id);
  }

  // ---------------------------------------------------------------- notes

  @Get("notes")
  async listNotes(@CurrentUser() user: AuthUser, @InstructorId() id: string) {
    await this.instructors.mustFind(user, id);
    return this.notes.list(id);
  }

  @Get("notes/:noteId")
  async getNote(@CurrentUser() user: AuthUser, @InstructorId() id: string, @NoteId() noteId: string) {
    await this.instructors.mustFind(user, id);
    return this.notes.get(id, noteId);
  }

  @Post("notes")
  async createNote(@CurrentUser() user: AuthUser, @InstructorId() id: string, @Body() dto: InstructorNoteDto) {
    await this.instructors.mustFind(user, id);
    return this.notes.create(user, id, dto);
  }

  @Patch("notes/:noteId")
  async updateNote(@CurrentUser() user: AuthUser, @InstructorId() id: string, @NoteId() noteId: string, @Body() dto: InstructorNoteDto) {
    await this.instructors.mustFind(user, id);
    return this.notes.update(user, id, noteId, dto);
  }

  @Delete("notes/:noteId")
  async deleteNote(@CurrentUser() user: AuthUser, @InstructorId() id: string, @NoteId() noteId: string) {
    await this.instructors.mustFind(user, id);
    return this.notes.remove(user, id, noteId);
  }
}
