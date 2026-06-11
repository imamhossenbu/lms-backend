import {
  IsString,
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
  @IsNumber() @IsNotEmpty() durationMinutes!: number;
  @IsNumber() @IsNotEmpty() order!: number;
  @IsBoolean() @IsOptional() isPreview?: boolean;
  @IsString() @IsOptional() status?: string;
}

export class UpdateLessonDto {
  @IsOptional() @IsString() title?: string;
  @IsOptional() @IsString() content?: string;
  @IsOptional() @IsString() videoUrl?: string;
  @IsOptional() @IsNumber() durationMinutes?: number;
  @IsOptional() @IsNumber() order?: number;
  @IsOptional() @IsBoolean() isPreview?: boolean;
}
