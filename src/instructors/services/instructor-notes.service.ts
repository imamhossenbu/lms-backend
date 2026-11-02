import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import type { InstructorNote, User } from "../../../generated/prisma";
import type { AuthUser } from "../../common/auth-user";
import { plainTextLength, sanitizeRichText } from "../../common/html";
import { PrismaService } from "../../prisma/prisma.service";
import type { InstructorNoteDto } from "../dto/instructor.dto";
import { noteTypeFromDb, noteTypeToDb, priorityFromDb, priorityToDb } from "../instructors.constants";
import type { InstructorNoteItem } from "../instructors.types";

type NoteRow = InstructorNote & { author: Pick<User, "id" | "name" | "avatar"> };
const authorSelect = { select: { id: true, name: true, avatar: true } } as const;

function toNoteItem(n: NoteRow): InstructorNoteItem {
  return {
    id: n.id,
    instructorId: n.instructorId,
    title: n.title,
    content: n.content,
    type: noteTypeFromDb(n.type),
    priority: priorityFromDb(n.priority),
    tags: n.tags,
    reminderDate: n.reminderDate ? n.reminderDate.toISOString().slice(0, 10) : null,
    author: { id: n.author.id, name: n.author.name, avatarUrl: n.author.avatar },
    createdAt: n.createdAt.toISOString(),
    updatedAt: n.updatedAt.toISOString(),
  };
}

/** Internal admin notes about an instructor (rich text, sanitized). Author edits; author or ADMIN deletes. */
@Injectable()
export class InstructorNotesService {
  constructor(private readonly prisma: PrismaService) {}

  /** Validates + normalises the editor payload into DB fields. */
  private toData(dto: InstructorNoteDto) {
    const content = sanitizeRichText(dto.content);
    if (plainTextLength(content) < 10) throw new BadRequestException("Note content must be at least 10 characters");
    return {
      title: dto.title,
      content,
      type: noteTypeToDb(dto.type),
      priority: priorityToDb(dto.priority),
      tags: [...new Set(dto.tags.map((t) => t.trim()).filter(Boolean))],
      reminderDate: dto.hasReminder && dto.reminderDate ? new Date(`${dto.reminderDate}T00:00:00Z`) : null,
    };
  }

  async list(instructorId: string): Promise<InstructorNoteItem[]> {
    const rows = await this.prisma.instructorNote.findMany({ where: { instructorId }, orderBy: { createdAt: "desc" }, include: { author: authorSelect } });
    return rows.map(toNoteItem);
  }

  private async mustNote(instructorId: string, noteId: string) {
    const note = await this.prisma.instructorNote.findFirst({ where: { id: noteId, instructorId }, include: { author: authorSelect } });
    if (!note) throw new NotFoundException("Note not found.");
    return note;
  }

  async get(instructorId: string, noteId: string): Promise<InstructorNoteItem> {
    return toNoteItem(await this.mustNote(instructorId, noteId));
  }

  async create(actor: AuthUser, instructorId: string, dto: InstructorNoteDto): Promise<InstructorNoteItem> {
    const row = await this.prisma.instructorNote.create({
      data: { instructorId, authorId: actor.userId, ...this.toData(dto) },
      include: { author: authorSelect },
    });
    return toNoteItem(row);
  }

  async update(actor: AuthUser, instructorId: string, noteId: string, dto: InstructorNoteDto): Promise<InstructorNoteItem> {
    const note = await this.mustNote(instructorId, noteId);
    if (note.authorId !== actor.userId) throw new ForbiddenException("Only the author can edit this note.");
    const row = await this.prisma.instructorNote.update({ where: { id: noteId }, data: this.toData(dto), include: { author: authorSelect } });
    return toNoteItem(row);
  }

  async remove(actor: AuthUser, instructorId: string, noteId: string): Promise<{ id: string; deleted: true }> {
    const note = await this.mustNote(instructorId, noteId);
    if (note.authorId !== actor.userId && actor.role !== "ADMIN") throw new ForbiddenException("Only the author or an admin can delete this note.");
    await this.prisma.instructorNote.delete({ where: { id: noteId } });
    return { id: noteId, deleted: true };
  }
}
