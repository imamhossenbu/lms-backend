import { ToBoolean, ToNumber } from "../../common/transforms";
import {
  IsString,
  IsUUID,
  IsNotEmpty,
  IsNumber,
  IsBoolean,
  IsOptional,
} from "class-validator";

export class CreateLessonDto {
  @IsString() @IsNotEmpty() title!: string;
  @IsString() @IsNotEmpty() type!: string; // e.g., 'VIDEO', 'TEXT', 'QUIZ'
  @IsString() @IsOptional() content?: string;
  @IsString() @IsOptional() videoUrl?: string;
  @ToNumber() @IsNumber() @IsNotEmpty() durationMinutes!: number;
  @ToNumber() @IsNumber() @IsNotEmpty() order!: number;
  @ToBoolean() @IsBoolean() @IsOptional() isPreview?: boolean;
  @IsString() @IsOptional() status?: string;
  /** JSON list of resource links kept on the lesson row (legacy field used by the course builder). */
  @IsString() @IsOptional() resources?: string;
}

export class UpdateLessonDto {
  @IsOptional() @IsString() title?: string;
  @IsOptional() @IsString() content?: string;
  @IsOptional() @IsString() videoUrl?: string;
  @IsOptional() @ToNumber() @IsNumber() durationMinutes?: number;
  @IsOptional() @ToNumber() @IsNumber() order?: number;
  @IsOptional() @ToBoolean() @IsBoolean() isPreview?: boolean;
  @IsOptional() @IsString() type?: string;
  @IsOptional() @IsString() status?: string;
  @IsOptional() @IsString() resources?: string;
  /** Moves the lesson to another module of the SAME course (checked in LessonService.update). */
  @IsOptional() @IsUUID("all", { message: "moduleId must be a valid id" }) moduleId?: string;
}
