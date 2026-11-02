import { ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import type { StudentNote, User } from "../../../generated/prisma";
import type { AuthUser } from "../../common/auth-user";
import { PrismaService } from "../../prisma/prisma.service";
import type { StudentNoteDto } from "../dto/student.dto";
import { NOTE_CATEGORY_LABEL, noteCategoryFromDb, noteCategoryToDb } from "../students.constants";
import type { StudentNoteItem } from "../students.types";

type NoteRow = StudentNote & { author: Pick<User, "id" | "name" | "role" | "avatar"> };

const ROLE_LABEL: Record<string, string> = { ADMIN: "Admin", TEACHER: "Instructor", SUPER_ADMIN: "Platform owner" };
const authorSelect = { select: { id: true, name: true, role: true, avatar: true } } as const;

function toNoteItem(n: NoteRow): StudentNoteItem {
  const category = noteCategoryFromDb(n.category);
  return {
    id: n.id,
    category,
    categoryLabel: NOTE_CATEGORY_LABEL[category],
    content: n.content,
    author: { id: n.author.id, name: n.author.name, role: ROLE_LABEL[n.author.role] ?? n.author.role, avatarUrl: n.author.avatar },
    createdAt: n.createdAt.toISOString(),
    updatedAt: n.updatedAt.toISOString(),
  };
}

/** Internal staff notes about a student. Only the author can edit; author or ADMIN can delete. */
@Injectable()
export class StudentNotesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(studentId: string): Promise<StudentNoteItem[]> {
    const rows = await this.prisma.studentNote.findMany({ where: { studentId }, orderBy: { createdAt: "desc" }, include: { author: authorSelect } });
    return rows.map(toNoteItem);
  }

  async create(actor: AuthUser, studentId: string, dto: StudentNoteDto): Promise<StudentNoteItem> {
    const row = await this.prisma.studentNote.create({
      data: { studentId, authorId: actor.userId, category: noteCategoryToDb(dto.category), content: dto.content },
      include: { author: authorSelect },
    });
    return toNoteItem(row);
  }

  private async mustNote(studentId: string, noteId: string) {
    const note = await this.prisma.studentNote.findFirst({ where: { id: noteId, studentId } });
    if (!note) throw new NotFoundException("Note not found.");
    return note;
  }

  async update(actor: AuthUser, studentId: string, noteId: string, dto: StudentNoteDto): Promise<StudentNoteItem> {
    const note = await this.mustNote(studentId, noteId);
    if (note.authorId !== actor.userId) throw new ForbiddenException("Only the author can edit this note.");
    const row = await this.prisma.studentNote.update({
      where: { id: noteId },
      data: { category: noteCategoryToDb(dto.category), content: dto.content },
      include: { author: authorSelect },
    });
    return toNoteItem(row);
  }

  async remove(actor: AuthUser, studentId: string, noteId: string): Promise<{ id: string; deleted: true }> {
    const note = await this.mustNote(studentId, noteId);
    if (note.authorId !== actor.userId && actor.role !== "ADMIN") throw new ForbiddenException("Only the author or an admin can delete this note.");
    await this.prisma.studentNote.delete({ where: { id: noteId } });
    return { id: noteId, deleted: true };
  }
}
