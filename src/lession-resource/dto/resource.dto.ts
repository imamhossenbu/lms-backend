import { IsString, IsNotEmpty, IsBoolean, IsOptional } from "class-validator";

export class CreateLessonResourceDto {
  @IsString() @IsNotEmpty() title!: string;
  @IsString() @IsNotEmpty() fileUrl!: string;
  @IsString() @IsNotEmpty() fileType!: string; // e.g., 'PDF', 'ZIP', 'PPT'
  @IsString() @IsNotEmpty() size!: string; // e.g., '2MB'
  @IsBoolean() @IsOptional() isDownloadable?: boolean;
}
